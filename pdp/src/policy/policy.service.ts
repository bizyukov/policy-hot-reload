import { Injectable, NotFoundException } from '@nestjs/common';

export interface CheckInput {
  subjectId: string;
  role: string;
  department: string;
  action: string;
  resourceType: string;
  resourceOwnerDepartment?: string;
}

export interface Rule {
  action: string;
  role?: string;
  department?: string;
  allow: boolean;
  description: string;
}

export interface PolicyVersion {
  id: number;
  status: 'active' | 'staged' | 'archived';
  description: string;
  rules: Rule[];
  createdAt: string;
}

export interface Decision {
  allowed: boolean;
  reason: string;
  policyVersion: number;
}

@Injectable()
export class PolicyService {
  private versions: PolicyVersion[] = [];
  private activeId = 1;
  private history: number[] = [];

  constructor() {
    this.versions.push({
      id: 1,
      status: 'active',
      description: 'Базовая версия: документы открыты для чтения всем ролям',
      rules: [
        {
          action: 'document:read',
          allow: true,
          description: 'Документы открыты для чтения (default allow)',
        },
      ],
      createdAt: new Date().toISOString(),
    });
  }

  getState() {
    return {
      activeId: this.activeId,
      versions: this.versions.map((v) => ({
        id: v.id,
        status: v.status,
        description: v.description,
        rules: v.rules,
        createdAt: v.createdAt,
      })),
    };
  }

  private getActive(): PolicyVersion {
    return this.versions.find((v) => v.id === this.activeId)!;
  }

  createVersion(description?: string, rule?: Partial<Rule>): PolicyVersion {
    const base = this.getActive();
    const rules: Rule[] = base.rules.map((r) => ({ ...r }));
    if (rule) {
      rules.push({
        action: rule.action || 'document:read',
        role: rule.role,
        department: rule.department,
        allow: rule.allow ?? false,
        description: rule.description || 'Добавленное правило',
      });
    }
    const id = Math.max(...this.versions.map((v) => v.id)) + 1;
    const version: PolicyVersion = {
      id,
      status: 'staged',
      description: description || `v${id}: копия активной v${base.id}`,
      rules,
      createdAt: new Date().toISOString(),
    };
    this.versions.push(version);
    return version;
  }

  activate(versionId: number) {
    const v = this.versions.find((x) => x.id === versionId);
    if (!v) throw new NotFoundException(`Версия ${versionId} не найдена`);
    if (v.id !== this.activeId) {
      this.history = [this.activeId];
    }
    this.activeId = versionId;
    this.recalcStatuses();
    return this.getState();
  }

  rollback() {
    if (this.history.length === 0) return this.getState();
    const prev = this.history.pop()!;
    this.activeId = prev;
    this.recalcStatuses();
    return this.getState();
  }

  private recalcStatuses() {
    this.versions.forEach((x) => {
      x.status = x.id === this.activeId ? 'active' : 'staged';
    });
  }

  can(ctx: CheckInput): Decision {
    const active = this.getActive();
    if (ctx.role === 'admin') {
      return { allowed: true, reason: 'admin bypass', policyVersion: active.id };
    }
    const candidates = active.rules.filter((r) => r.action === ctx.action);
    // Самое специфичное правило: роль + отдел ресурса
    const withDept = candidates.find(
      (r) => r.role === ctx.role && r.department && r.department === ctx.resourceOwnerDepartment,
    );
    // Затем правило только для роли
    const withRole = candidates.find((r) => r.role === ctx.role && !r.department);
    // Затем общее правило без роли
    const generic = candidates.find((r) => !r.role && !r.department);
    const rule = withDept ?? withRole ?? generic;
    if (rule) {
      return { allowed: rule.allow, reason: rule.description, policyVersion: active.id };
    }
    return { allowed: true, reason: 'default allow', policyVersion: active.id };
  }
}