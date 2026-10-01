import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

const API_BASE = 'http://localhost:3000';

interface Account {
  username: string;
  label: string;
  password: string;
}

interface Doc {
  id: number;
  title: string;
  department: string;
}

interface Version {
  id: number;
  status: string;
  description: string;
  createdAt: string;
  rules: { action: string; role?: string; department?: string; allow: boolean; description: string }[];
}

interface HttpResult {
  ok: boolean;
  status: number;
  data: any;
}

const ACCOUNTS: Account[] = [
  { username: 'admin', label: 'admin / admin', password: 'admin' },
  { username: 'viewer', label: 'viewer / viewer (sales)', password: 'viewer' },
  { username: 'manager', label: 'manager / manager (it)', password: 'manager' },
];

const DOCS: Doc[] = [
  { id: 1, title: 'Бюджет Q1', department: 'finance' },
  { id: 3, title: 'Бюджет Q3', department: 'finance' },
  { id: 4, title: 'План продаж', department: 'sales' },
  { id: 6, title: 'Склад IT', department: 'it' },
  { id: 7, title: 'Контракт с заказчиком', department: 'sales' },
];

@Component({
  selector: 'app-root',
  imports: [CommonModule],
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  readonly accounts = ACCOUNTS;
  readonly docs = DOCS;

  username = signal<string>('viewer');
  token = signal<string | null>(null);
  currentUser = signal<string>('');
  role = signal<string>('');
  loading = signal(false);

  docResults = signal<Record<number, { ok: boolean; text: string }>>({});
  versions = signal<Version[]>([]);
  activeId = signal<number | null>(null);
  policyMsg = signal<string | null>(null);

  async selectAccount(value: string) {
    this.username.set(value);
    this.token.set(null);
    this.currentUser.set('');
    this.role.set('');
    this.docResults.set({});
  }

  async login() {
    this.loading.set(true);
    try {
      const r = await this.do(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: this.username(), password: this.username() }),
      });
      if (r.ok) {
        this.token.set(r.data.token);
        this.currentUser.set(this.username());
        this.role.set(r.data.role);
        this.docResults.set({});
        await this.fetchPolicies();
      } else {
        this.policyMsg.set(`Ошибка логина: ${r.status}`);
      }
    } finally {
      this.loading.set(false);
    }
  }

  async loadDocument(doc: Doc) {
    if (!this.token()) return;
    this.loading.set(true);
    try {
      const r = await this.do(`${API_BASE}/documents/${doc.id}`, {
        headers: { Authorization: `Bearer ${this.token()}` },
      });
      if (r.ok) {
        this.docResults.update((m) => ({
          ...m,
          [doc.id]: {
            ok: true,
            text: `200 OK · v${r.data.policyVersion} · ${r.data.reason}`,
          },
        }));
      } else {
        this.docResults.update((m) => ({
          ...m,
          [doc.id]: {
            ok: false,
            text: `${r.status} ${r.data?.message ?? ''}`,
          },
        }));
      }
    } finally {
      this.loading.set(false);
    }
  }

  async fetchPolicies() {
    const r = await this.do(`${API_BASE}/policies`);
    if (r.ok) {
      this.versions.set(r.data.versions);
      this.activeId.set(r.data.activeId);
    }
  }

  async createVersion() {
    if (!this.token()) return;
    this.loading.set(true);
    try {
      const r = await this.do(`${API_BASE}/policies/versions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          description: 'v-next: закрыть viewer доступ к finance',
          rule: {
            action: 'document:read',
            role: 'viewer',
            department: 'finance',
            allow: false,
            description: 'viewer закрыт доступ к finance',
          },
        }),
      });
      if (r.ok) {
        await this.fetchPolicies();
        this.policyMsg.set('Staged-версия создана. Активная версия не изменилась ✔');
      } else {
        this.policyMsg.set(`Ошибка: ${r.status}`);
      }
    } finally {
      this.loading.set(false);
    }
  }

  async activateStaged() {
    if (!this.token()) return;
    const staged = [...this.versions()].reverse().find((v) => v.status === 'staged' && v.id !== this.activeId());
    if (!staged) {
      this.policyMsg.set('Нет staged-версии для активации');
      return;
    }
    this.loading.set(true);
    try {
      const r = await this.do(`${API_BASE}/policies/activate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ versionId: staged.id }),
      });
      if (r.ok) {
        await this.fetchPolicies();
        this.policyMsg.set(`⚡ Атомарный свап: активна v${staged.id}. Никаких рестартов.`);
        this.docResults.set({});
      } else {
        this.policyMsg.set(`Ошибка: ${r.status}`);
      }
    } finally {
      this.loading.set(false);
    }
  }

  async rollback() {
    if (!this.token()) return;
    this.loading.set(true);
    try {
      const r = await this.do(`${API_BASE}/policies/rollback`, { method: 'POST' });
      if (r.ok) {
        await this.fetchPolicies();
        this.policyMsg.set('↩ Откат выполнен: активна предыдущая версия.');
        this.docResults.set({});
      } else {
        this.policyMsg.set(`Ошибка: ${r.status}`);
      }
    } finally {
      this.loading.set(false);
    }
  }

  private async do(url: string, init?: RequestInit): Promise<HttpResult> {
    const res = await fetch(url, init);
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  }
}