import {
  Body,
  Controller,
  Get,
  Post,
  Req,
} from "@nestjs/common";
import { DeveloperSqlService } from "./developer-sql.service";
import {
  ExecuteDeveloperSqlDto,
  SaveDeveloperSqlHistoryDto,
} from "./dto/developer-sql.dto";

@Controller("developer/sql")
export class DeveloperSqlController {
  constructor(private readonly developerSqlService: DeveloperSqlService) {}

  @Get("status")
  status() {
    return this.developerSqlService.status();
  }

  @Get("history")
  history() {
    return this.developerSqlService.historyList();
  }

  @Post("history")
  saveHistory(@Body() dto: SaveDeveloperSqlHistoryDto) {
    return this.developerSqlService.saveHistory(dto);
  }

  @Post("execute")
  execute(@Body() dto: ExecuteDeveloperSqlDto, @Req() req: any) {
    return this.developerSqlService.execute(dto, req?.user);
  }
}
