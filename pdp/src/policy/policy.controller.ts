import { Body, Controller, Get, Post } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { CheckInput, PolicyService, Rule } from './policy.service';

@Controller()
export class PolicyController {
  constructor(private readonly policy: PolicyService) {}

  @Get('policies')
  policies() {
    return this.policy.getState();
  }

  @Post('policies/versions')
  createVersion(@Body() body: { description?: string; rule?: Partial<Rule> }) {
    return this.policy.createVersion(body.description, body.rule);
  }

  @Post('policies/activate')
  activate(@Body() body: { versionId: number }) {
    return this.policy.activate(body.versionId);
  }

  @Post('policies/rollback')
  rollback() {
    return this.policy.rollback();
  }

  @GrpcMethod('PDPService', 'CheckAccess')
  checkAccess(ctx: CheckInput) {
    return this.policy.can(ctx);
  }
}