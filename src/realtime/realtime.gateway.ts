import {
  Logger,
  OnModuleDestroy,
} from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";

import {
  RealtimeAuthGuard,
  type RealtimeAuthenticatedUser,
} from "./realtime-auth.guard";
import {
  RealtimeEventsService,
  type RealtimeInvalidationEvent,
} from "./realtime-events.service";

const accountRoom = (accountId: string) => `account:${accountId}`;
const schoolRoom = (accountId: string, schoolId: number) =>
  `account:${accountId}:school:${schoolId}`;
const branchRoom = (accountId: string, branchId: number) =>
  `account:${accountId}:branch:${branchId}`;

@WebSocketGateway({
  namespace: "/realtime",
  cors: {
    origin: true,
    credentials: true,
  },
  transports: ["websocket", "polling"],
})
export class RealtimeGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly authGuard: RealtimeAuthGuard,
    private readonly events: RealtimeEventsService,
  ) {}

  afterInit() {
    this.events.bindEmitter((event) => this.broadcast(event));
    this.logger.log("Realtime WebSocket gateway initialized.");
  }

  async handleConnection(client: Socket) {
    try {
      const user = await this.authGuard.authenticate(client);
      const deviceId = this.readDeviceId(client);

      client.data.user = user;
      client.data.accountId = user.accountId;
      client.data.deviceId = deviceId;

      await client.join(accountRoom(user.accountId));

      client.emit("REALTIME_READY", {
        accountId: user.accountId,
        deviceId,
        at: Date.now(),
      });
    } catch (error: any) {
      client.emit("REALTIME_AUTH_ERROR", {
        message: error?.message || "Realtime authentication failed.",
      });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Realtime client disconnected: ${client.id}`);
  }

  onModuleDestroy() {
    this.events.unbindEmitter();
  }

  @SubscribeMessage("SUBSCRIBE_CONTEXT")
  async subscribeContext(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { schoolId?: number | string | null; branchId?: number | string | null },
  ) {
    const user = client.data.user as RealtimeAuthenticatedUser | undefined;
    if (!user?.accountId) return { ok: false };

    const schoolId = this.positiveNumber(body?.schoolId);
    const branchId = this.positiveNumber(body?.branchId);

    if (schoolId) await client.join(schoolRoom(user.accountId, schoolId));
    if (branchId) await client.join(branchRoom(user.accountId, branchId));

    return { ok: true, schoolId, branchId };
  }

  @SubscribeMessage("PING")
  ping() {
    return { event: "PONG", data: { at: Date.now() } };
  }

  private broadcast(event: RealtimeInvalidationEvent) {
    // Account room is authoritative. Context rooms are available for future
    // targeted event types but are not emitted separately here to avoid
    // duplicate delivery to clients joined to both rooms.
    this.server
      .to(accountRoom(event.accountId))
      .emit(event.type, event);
  }

  private readDeviceId(client: Socket) {
    const authValue = client.handshake.auth?.deviceId;
    const queryValue = client.handshake.query?.deviceId;
    const candidate =
      (Array.isArray(authValue) ? authValue[0] : authValue) ||
      (Array.isArray(queryValue) ? queryValue[0] : queryValue);

    return String(candidate || "").trim() || undefined;
  }

  private positiveNumber(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
}