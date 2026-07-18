/**
 * src/media/media.module.ts
 */

import {
  Module,
} from "@nestjs/common";

import {
  MediaController,
} from "./media.controller";

import {
  MediaService,
} from "./media.service";

import {
  MediaStorageService,
} from "./media-storage.service";

@Module({
  controllers: [
    MediaController,
  ],
  providers: [
    MediaService,
    MediaStorageService,
  ],
  exports: [
    MediaService,
    MediaStorageService,
  ],
})
export class MediaModule {}