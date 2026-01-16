/**
 * API Mocker
 *
 * Wraps Playwright's page.route() to provide easy mocking of API endpoints.
 * Supports both full mocking and selective passthrough for real API calls.
 */

import type { Page, Route } from '@playwright/test';
import type {
  User,
  Workshop,
  Trace,
  Rubric,
  DiscoveryFinding,
  Annotation,
  UserPermissions,
  AuthResponse,
} from '../types';
import {
  buildPermissions,
  buildAuthResponse,
} from './response-builder';

/**
 * Route configuration for an endpoint
 */
interface RouteConfig {
  /** URL pattern to match */
  pattern: RegExp | string;
  /** Handler for GET requests */
  get?: (route: Route, params: RouteParams) => Promise<void>;
  /** Handler for POST requests */
  post?: (route: Route, params: RouteParams) => Promise<void>;
  /** Handler for PUT requests */
  put?: (route: Route, params: RouteParams) => Promise<void>;
  /** Handler for DELETE requests */
  delete?: (route: Route, params: RouteParams) => Promise<void>;
}

/**
 * Parameters extracted from route URL
 */
interface RouteParams {
  workshopId?: string;
  userId?: string;
  promptId?: string;
  questionId?: string;
  phase?: string;
  [key: string]: string | undefined;
}

/**
 * Mock data store for a scenario
 */
export interface MockDataStore {
  workshop?: Workshop;
  users: User[];
  traces: Trace[];
  rubric?: Rubric;
  findings: DiscoveryFinding[];
  annotations: Annotation[];
  discoveryComplete: Map<string, boolean>;
}

/**
 * API Mocker class
 *
 * Sets up route handlers for all API endpoints, allowing selective
 * passthrough to real APIs via withReal().
 */
export class ApiMocker {
  private page: Page;
  private store: MockDataStore;
  private realEndpoints: Set<string>;
  private realServices: Set<string>;
  private routes: RouteConfig[] = [];

  constructor(page: Page, store: MockDataStore) {
    this.page = page;
    this.store = store;
    this.realEndpoints = new Set();
    this.realServices = new Set();
    this.setupRoutes();
  }

  /**
   * Mark a service as "real" (passthrough to actual API)
   */
  addRealService(service: string): void {
    this.realServices.add(service);
  }

  /**
   * Mark an endpoint pattern as "real" (passthrough to actual API)
   */
  addRealEndpoint(endpoint: string): void {
    this.realEndpoints.add(endpoint);
  }

  /**
   * Check if a URL should be passed through to real API
   */
  private shouldPassthrough(url: string): boolean {
    // Check explicit endpoint patterns
    for (const endpoint of this.realEndpoints) {
      if (url.includes(endpoint)) {
        return true;
      }
    }

    // Check service-level passthrough
    if (this.realServices.has('WorkshopsService') && url.includes('/workshops')) {
      return true;
    }
    if (this.realServices.has('UsersService') && url.includes('/users')) {
      return true;
    }
    if (this.realServices.has('DatabricksService') && url.includes('/databricks')) {
      return true;
    }
    if (this.realServices.has('DbsqlExportService') && url.includes('/dbsql')) {
      return true;
    }

    return false;
  }

  /**
   * Extract route parameters from URL
   */
  private extractParams(url: string): RouteParams {
    const params: RouteParams = {};

    // Extract workshop_id
    const workshopMatch = url.match(/\/workshops\/([a-f0-9-]+)/i);
    if (workshopMatch) {
      params.workshopId = workshopMatch[1];
    }

    // Extract user_id
    const userMatch = url.match(/\/users\/([a-f0-9-]+)/i);
    if (userMatch) {
      params.userId = userMatch[1];
    }

    // Extract prompt_id
    const promptMatch = url.match(/\/judge-prompts\/([a-f0-9-]+)/i);
    if (promptMatch) {
      params.promptId = promptMatch[1];
    }

    // Extract question_id
    const questionMatch = url.match(/\/questions\/([a-f0-9-]+)/i);
    if (questionMatch) {
      params.questionId = questionMatch[1];
    }

    // Extract phase
    const phaseMatch = url.match(
      /\/(complete-phase|resume-phase)\/([a-z_]+)/i
    );
    if (phaseMatch) {
      params.phase = phaseMatch[2];
    }

    return params;
  }

  /**
   * Setup all route handlers
   */
  private setupRoutes(): void {
    // Users routes
    this.routes.push({
      pattern: /\/users\/auth\/login$/,
      post: async (route) => {
        const body = route.request().postDataJSON();
        const user = this.store.users.find((u) => u.email === body?.email);
        if (user) {
          const isFacilitator = user.role === 'facilitator';
          await route.fulfill({
            json: buildAuthResponse(user, isFacilitator),
          });
        } else {
          await route.fulfill({
            status: 401,
            json: { detail: 'Invalid credentials' },
          });
        }
      },
    });

    this.routes.push({
      pattern: /\/users\/$/,
      get: async (route) => {
        const url = new URL(route.request().url());
        const workshopId = url.searchParams.get('workshop_id');
        const role = url.searchParams.get('role');

        let users = this.store.users;
        if (workshopId) {
          users = users.filter((u) => u.workshop_id === workshopId);
        }
        if (role) {
          users = users.filter((u) => u.role === role);
        }

        await route.fulfill({ json: users });
      },
      post: async (route) => {
        const body = route.request().postDataJSON();
        // Return created user - in real tests, we'd add to store
        await route.fulfill({
          status: 201,
          json: { id: body?.id || 'new-user-id', ...body },
        });
      },
    });

    this.routes.push({
      pattern: /\/users\/([a-f0-9-]+)$/i,
      get: async (route, params) => {
        const user = this.store.users.find((u) => u.id === params.userId);
        if (user) {
          await route.fulfill({ json: user });
        } else {
          await route.fulfill({ status: 404, json: { detail: 'User not found' } });
        }
      },
    });

    this.routes.push({
      pattern: /\/users\/([a-f0-9-]+)\/permissions$/i,
      get: async (route, params) => {
        const user = this.store.users.find((u) => u.id === params.userId);
        if (user) {
          await route.fulfill({ json: buildPermissions(user.role) });
        } else {
          await route.fulfill({ status: 404, json: { detail: 'User not found' } });
        }
      },
    });

    // Workshop routes
    this.routes.push({
      pattern: /\/workshops\/$/,
      post: async (route) => {
        if (this.store.workshop) {
          await route.fulfill({ status: 201, json: this.store.workshop });
        } else {
          await route.fulfill({ status: 500, json: { detail: 'No workshop configured' } });
        }
      },
    });

    this.routes.push({
      pattern: /\/workshops\/([a-f0-9-]+)$/i,
      get: async (route) => {
        if (this.store.workshop) {
          await route.fulfill({ json: this.store.workshop });
        } else {
          await route.fulfill({ status: 404, json: { detail: 'Workshop not found' } });
        }
      },
    });

    // Traces routes
    this.routes.push({
      pattern: /\/workshops\/([a-f0-9-]+)\/traces$/i,
      get: async (route) => {
        await route.fulfill({ json: this.store.traces });
      },
      post: async (route) => {
        await route.fulfill({ status: 201, json: this.store.traces });
      },
    });

    this.routes.push({
      pattern: /\/workshops\/([a-f0-9-]+)\/all-traces$/i,
      get: async (route) => {
        await route.fulfill({ json: this.store.traces });
      },
    });

    this.routes.push({
      pattern: /\/workshops\/([a-f0-9-]+)\/original-traces$/i,
      get: async (route) => {
        await route.fulfill({ json: this.store.traces });
      },
    });

    // Rubric routes
    this.routes.push({
      pattern: /\/workshops\/([a-f0-9-]+)\/rubric$/i,
      get: async (route) => {
        if (this.store.rubric) {
          await route.fulfill({ json: this.store.rubric });
        } else {
          await route.fulfill({ status: 404, json: { detail: 'No rubric found' } });
        }
      },
      post: async (route) => {
        const body = route.request().postDataJSON();
        const rubric = {
          id: 'rubric-' + Date.now(),
          workshop_id: this.store.workshop?.id || '',
          question: body?.question || '',
          judge_type: body?.judge_type || 'likert',
          rating_scale: body?.rating_scale || 5,
          created_by: body?.created_by || '',
          created_at: new Date().toISOString(),
        };
        this.store.rubric = rubric as Rubric;
        await route.fulfill({ status: 201, json: rubric });
      },
      put: async (route) => {
        const body = route.request().postDataJSON();
        if (this.store.rubric) {
          this.store.rubric = { ...this.store.rubric, ...body };
          await route.fulfill({ json: this.store.rubric });
        } else {
          await route.fulfill({ status: 404, json: { detail: 'No rubric found' } });
        }
      },
    });

    // Findings routes
    this.routes.push({
      pattern: /\/workshops\/([a-f0-9-]+)\/findings$/i,
      get: async (route) => {
        const url = new URL(route.request().url());
        const userId = url.searchParams.get('user_id');
        let findings = this.store.findings;
        if (userId) {
          findings = findings.filter((f) => f.user_id === userId);
        }
        await route.fulfill({ json: findings });
      },
      post: async (route) => {
        const body = route.request().postDataJSON();
        const finding = {
          id: 'finding-' + Date.now(),
          workshop_id: this.store.workshop?.id || '',
          trace_id: body?.trace_id || '',
          user_id: body?.user_id || '',
          insight: body?.insight || '',
          created_at: new Date().toISOString(),
        };
        this.store.findings.push(finding as DiscoveryFinding);
        await route.fulfill({ status: 201, json: finding });
      },
    });

    // Annotations routes
    this.routes.push({
      pattern: /\/workshops\/([a-f0-9-]+)\/annotations$/i,
      get: async (route) => {
        const url = new URL(route.request().url());
        const userId = url.searchParams.get('user_id');
        let annotations = this.store.annotations;
        if (userId) {
          annotations = annotations.filter((a) => a.user_id === userId);
        }
        await route.fulfill({ json: annotations });
      },
      post: async (route) => {
        const body = route.request().postDataJSON();
        const annotation = {
          id: 'annotation-' + Date.now(),
          workshop_id: this.store.workshop?.id || '',
          trace_id: body?.trace_id || '',
          user_id: body?.user_id || '',
          rating: body?.rating || 3,
          ratings: body?.ratings,
          comment: body?.comment,
          created_at: new Date().toISOString(),
        };
        this.store.annotations.push(annotation as Annotation);
        await route.fulfill({ status: 201, json: annotation });
      },
    });

    // Phase advancement routes
    this.routes.push({
      pattern: /\/workshops\/([a-f0-9-]+)\/begin-discovery$/i,
      post: async (route) => {
        if (this.store.workshop) {
          this.store.workshop.discovery_started = true;
          this.store.workshop.current_phase = 'discovery';
        }
        await route.fulfill({ json: { success: true } });
      },
    });

    this.routes.push({
      pattern: /\/workshops\/([a-f0-9-]+)\/advance-to-discovery$/i,
      post: async (route) => {
        if (this.store.workshop) {
          this.store.workshop.current_phase = 'discovery';
        }
        await route.fulfill({ json: { success: true } });
      },
    });

    this.routes.push({
      pattern: /\/workshops\/([a-f0-9-]+)\/advance-to-rubric$/i,
      post: async (route) => {
        if (this.store.workshop) {
          this.store.workshop.current_phase = 'rubric';
          this.store.workshop.completed_phases = ['intake', 'discovery'];
        }
        await route.fulfill({ json: { success: true } });
      },
    });

    this.routes.push({
      pattern: /\/workshops\/([a-f0-9-]+)\/advance-to-annotation$/i,
      post: async (route) => {
        if (this.store.workshop) {
          this.store.workshop.current_phase = 'annotation';
          this.store.workshop.annotation_started = true;
          this.store.workshop.completed_phases = ['intake', 'discovery', 'rubric'];
        }
        await route.fulfill({ json: { success: true } });
      },
    });

    this.routes.push({
      pattern: /\/workshops\/([a-f0-9-]+)\/advance-to-results$/i,
      post: async (route) => {
        if (this.store.workshop) {
          this.store.workshop.current_phase = 'results';
          this.store.workshop.completed_phases = [
            'intake',
            'discovery',
            'rubric',
            'annotation',
          ];
        }
        await route.fulfill({ json: { success: true } });
      },
    });

    // Discovery completion routes
    this.routes.push({
      pattern: /\/workshops\/([a-f0-9-]+)\/users\/([a-f0-9-]+)\/complete-discovery$/i,
      post: async (route, params) => {
        if (params.userId) {
          this.store.discoveryComplete.set(params.userId, true);
        }
        await route.fulfill({ json: { success: true } });
      },
    });

    this.routes.push({
      pattern: /\/workshops\/([a-f0-9-]+)\/users\/([a-f0-9-]+)\/discovery-complete$/i,
      get: async (route, params) => {
        const complete = params.userId
          ? this.store.discoveryComplete.get(params.userId) || false
          : false;
        await route.fulfill({ json: { discovery_complete: complete } });
      },
    });

    this.routes.push({
      pattern: /\/workshops\/([a-f0-9-]+)\/discovery-completion-status$/i,
      get: async (route) => {
        const participants = this.store.users.filter(
          (u) => u.role === 'participant' || u.role === 'sme'
        );
        const completed = participants.filter((p) =>
          this.store.discoveryComplete.get(p.id)
        ).length;
        await route.fulfill({
          json: {
            total_participants: participants.length,
            completed_participants: completed,
            all_completed: completed === participants.length && participants.length > 0,
          },
        });
      },
    });

    // Participants route
    this.routes.push({
      pattern: /\/workshops\/([a-f0-9-]+)\/participants$/i,
      get: async (route) => {
        const participants = this.store.users.filter(
          (u) => u.role === 'participant' || u.role === 'sme'
        );
        await route.fulfill({ json: participants });
      },
    });

    // IRR route
    this.routes.push({
      pattern: /\/workshops\/([a-f0-9-]+)\/irr$/i,
      get: async (route) => {
        await route.fulfill({
          json: {
            workshop_id: this.store.workshop?.id || '',
            score: 0.75,
            ready_to_proceed: true,
            calculated_at: new Date().toISOString(),
            details: {},
          },
        });
      },
    });
  }

  /**
   * Handle a route request
   */
  private async handleRoute(route: Route): Promise<void> {
    const url = route.request().url();
    const method = route.request().method().toLowerCase();

    // Check if this should passthrough to real API
    if (this.shouldPassthrough(url)) {
      await route.fallback();
      return;
    }

    // Find matching route handler
    const params = this.extractParams(url);

    for (const routeConfig of this.routes) {
      const pattern =
        typeof routeConfig.pattern === 'string'
          ? new RegExp(routeConfig.pattern.replace(/\//g, '\\/'))
          : routeConfig.pattern;

      if (pattern.test(url)) {
        const handler = routeConfig[method as keyof RouteConfig] as
          | ((route: Route, params: RouteParams) => Promise<void>)
          | undefined;

        if (handler) {
          await handler(route, params);
          return;
        }
      }
    }

    // No handler found - return 404 for unhandled API routes
    await route.fulfill({
      status: 404,
      json: { detail: `No mock handler for ${method.toUpperCase()} ${url}` },
    });
  }

  /**
   * Install all route handlers on the page
   */
  async install(): Promise<void> {
    // Handle /users/** routes
    await this.page.route('**/users/**', async (route) => {
      await this.handleRoute(route);
    });

    // Handle /workshops/** routes
    await this.page.route('**/workshops/**', async (route) => {
      await this.handleRoute(route);
    });
  }

  /**
   * Update the mock data store
   */
  updateStore(updates: Partial<MockDataStore>): void {
    if (updates.workshop) this.store.workshop = updates.workshop;
    if (updates.users) this.store.users = updates.users;
    if (updates.traces) this.store.traces = updates.traces;
    if (updates.rubric) this.store.rubric = updates.rubric;
    if (updates.findings) this.store.findings = updates.findings;
    if (updates.annotations) this.store.annotations = updates.annotations;
  }
}
