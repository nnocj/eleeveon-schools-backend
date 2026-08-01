import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { PublicWebsitesService } from "./public-websites.service";

@Controller("public-websites")
export class PublicWebsitesController {
  constructor(private readonly service: PublicWebsitesService) {}

  @Get(":slug")
  async findPublishedWebsite(@Param("slug") slug: string) {
    const website = await this.service.findPublishedBySlug(slug);
    if (!website) throw new NotFoundException("Published website not found");
    return website;
  }
}
