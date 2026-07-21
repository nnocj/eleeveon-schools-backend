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

const accountRoom = (accountId: string): string =>
  `account:${accountId}`;

const schoolRoom = (
  accountId: string,
  schoolId: string,
): string =>
  `account:${accountId}:school:${schoolId}`;

const branchRoom = (
  accountId: string,
  branchId: string,
): string =>
  `account:${accountId}:branch:${branchId}`;

type SubscribeContextBody = {
  schoolId?: string | null;
  branchId?: string | null;
};

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

  private readonly logger =
    new Logger(RealtimeGateway.name);

  constructor(
    private readonly authGuard: RealtimeAuthGuard,
    private readonly events: RealtimeEventsService,
  ) {}

  afterInit(): void {
    this.events.bindEmitter((event) =>
      this.broadcast(event),
    );

    this.logger.log(
      "Realtime WebSocket gateway initialized.",
    );
  }

  async handleConnection(
    client: Socket,
  ): Promise<void> {
    try {
      const user =
        await this.authGuard.authenticate(client);
      const deviceId =
        this.readDeviceId(client);

      client.data.user = user;
      client.data.accountId =
        user.accountId;
      client.data.deviceId =
        deviceId;

      await client.join(
        accountRoom(user.accountId),
      );

      client.emit(
        "REALTIME_READY",
        {
          accountId:
            user.accountId,
          deviceId,
          at: Date.now(),
        },
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Realtime authentication failed.";

      client.emit(
        "REALTIME_AUTH_ERROR",
        {
          message,
        },
      );

      client.disconnect(true);
    }
  }

  handleDisconnect(
    client: Socket,
  ): void {
    this.logger.debug(
      `Realtime client disconnected: ${client.id}`,
    );
  }

  onModuleDestroy(): void {
    this.events.unbindEmitter();
  }

  @SubscribeMessage(
    "SUBSCRIBE_CONTEXT",
  )
  async subscribeContext(
    @ConnectedSocket()
    client: Socket,
    @MessageBody()
    body: SubscribeContextBody,
  ): Promise<{
    ok: boolean;
    schoolId?: string;
    branchId?: string;
  }> {
    const user =
      client.data.user as
        | RealtimeAuthenticatedUser
        | undefined;

    if (!user?.accountId) {
      return {
        ok: false,
      };
    }

    const schoolId =
      this.normalizeId(
        body?.schoolId,
      );
    const branchId =
      this.normalizeId(
        body?.branchId,
      );

    if (schoolId) {
      await client.join(
        schoolRoom(
          user.accountId,
          schoolId,
        ),
      );
    }

    if (branchId) {
      await client.join(
        branchRoom(
          user.accountId,
          branchId,
        ),
      );
    }

    return {
      ok: true,
      schoolId,
      branchId,
    };
  }

  @SubscribeMessage("PING")
  ping(): {
    event: "PONG";
    data: {
      at: number;
    };
  } {
    return {
      event: "PONG",
      data: {
        at: Date.now(),
      },
    };
  }

  private broadcast(
    event: RealtimeInvalidationEvent,
  ): void {
    /**
     * The account room remains authoritative. Context rooms are joined and
     * available for future targeted delivery, but this event is emitted only
     * once to prevent duplicate delivery to clients subscribed to both the
     * account room and school/branch rooms.
     */
    this.server
      .to(
        accountRoom(
          event.accountId,
        ),
      )
      .emit(
        event.type,
        event,
      );
  }

  private readDeviceId(
    client: Socket,
  ): string | undefined {
    const authValue =
      client.handshake.auth
        ?.deviceId;
    const queryValue =
      client.handshake.query
        ?.deviceId;

    const candidate =
      (
        Array.isArray(
          authValue,
        )
          ? authValue[0]
          : authValue
      ) ||
      (
        Array.isArray(
          queryValue,
        )
          ? queryValue[0]
          : queryValue
      );

    return this.normalizeId(
      candidate,
    );
  }

  private normalizeId(
    value: unknown,
  ): string | undefined {
    if (
      value === null ||
      value === undefined
    ) {
      return undefined;
    }

    const normalized =
      String(value).trim();

    return normalized ||
      undefined;
  }
}