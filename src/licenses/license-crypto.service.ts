import {
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import * as crypto from "crypto";
import type {
  SignedLicenseStatePayload,
} from "./types/license.types";

@Injectable()
export class LicenseCryptoService {
  generateLicenseKey(): string {
    const body = crypto
      .randomBytes(24)
      .toString("base64url")
      .toUpperCase();

    return `ELV-${body}`;
  }

  hash(value: string): string {
    return crypto
      .createHash("sha256")
      .update(value.trim())
      .digest("hex");
  }

  fingerprintHash(
    value?: string,
  ): string | undefined {
    if (!value?.trim()) return undefined;
    return this.hash(value.trim());
  }

  token(): string {
    return crypto
      .randomBytes(32)
      .toString("base64url");
  }

  signState(
    payload: SignedLicenseStatePayload,
  ): string {
    const secret = this.secret();
    const encoded = Buffer.from(
      JSON.stringify(payload),
      "utf8",
    ).toString("base64url");

    const signature = crypto
      .createHmac("sha256", secret)
      .update(encoded)
      .digest("base64url");

    return `${encoded}.${signature}`;
  }

  verifyState(
    token: string,
  ): SignedLicenseStatePayload | null {
    const [encoded, suppliedSignature] =
      token.split(".");

    if (!encoded || !suppliedSignature) {
      return null;
    }

    const expectedSignature = crypto
      .createHmac("sha256", this.secret())
      .update(encoded)
      .digest("base64url");

    const left = Buffer.from(
      suppliedSignature,
      "utf8",
    );
    const right = Buffer.from(
      expectedSignature,
      "utf8",
    );

    if (
      left.length !== right.length ||
      !crypto.timingSafeEqual(left, right)
    ) {
      return null;
    }

    try {
      return JSON.parse(
        Buffer.from(
          encoded,
          "base64url",
        ).toString("utf8"),
      ) as SignedLicenseStatePayload;
    } catch {
      return null;
    }
  }

  private secret(): string {
    const secret =
      process.env.LICENSE_SIGNING_SECRET?.trim();

    if (!secret || secret.length < 32) {
      throw new InternalServerErrorException(
        "LICENSE_SIGNING_SECRET must contain at least 32 characters.",
      );
    }

    return secret;
  }
}
