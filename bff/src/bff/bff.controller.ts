import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { BffService } from './bff.service';

type VersionRule = {
  action?: string;
  role?: string;
  department?: string;
  allow?: boolean;
  description?: string;
};

@Controller()
export class BffController {
  constructor(private readonly bff: BffService) {}

  @Post('auth/login')
  login(@Body() body: { username: string; password: string }) {
    return this.bff.login(body.username, body.password);
  }

  @Get('documents/:id')
  document(@Param('id') id: string, @Headers('authorization') auth?: string) {
    return this.bff.getDocument(Number(id), auth);
  }

  @Get('policies')
  policies() {
    return this.bff.getPolicies();
  }

  @Post('policies/versions')
  createVersion(@Body() body: { description?: string; rule?: VersionRule }) {
    return this.bff.createVersion(body.description, body.rule);
  }

  @Post('policies/activate')
  activate(@Body() body: { versionId: number }) {
    return this.bff.activateVersion(body.versionId);
  }

  @Post('policies/rollback')
  rollback() {
    return this.bff.rollback();
  }
}