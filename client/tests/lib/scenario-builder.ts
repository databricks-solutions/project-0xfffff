/**
 * TestScenario - Fluent builder for e2e test scenarios
 *
 * Provides a chainable API to configure and build test scenarios
 * with mock data, users, and workshop state.
 */

import type { Page, Browser, BrowserContext } from '@playwright/test';
import type {
  User,
  UserRole,
  Workshop,
  WorkshopPhase,
  Trace,
  Rubric,
  Annotation,
  DiscoveryFinding,
  WorkshopConfig,
  UserConfig,
  TraceConfig,
  RubricConfig,
  FindingConfig,
  AnnotationConfig,
  BuiltScenario,
  BuilderState,
  PageActions,
  ScenarioApi,
  UsersByRole,
} from './types';

import {
  ApiMocker,
  MockDataStore,
  UserBuilder,
  WorkshopBuilder,
  TraceBuilder,
  RubricBuilder,
  FindingBuilder,
  AnnotationBuilder,
  resetIdCounter,
} from './mocks';

import {
  DEFAULT_API_URL,
  DEFAULT_FACILITATOR,
  SAMPLE_TRACE_INPUTS,
  SAMPLE_TRACE_OUTPUTS,
  SAMPLE_INSIGHTS,
  generateRunId,
  generateTestEmail,
  generateTestName,
  shouldDiscoveryBeStarted,
  shouldAnnotationBeStarted,
} from './data';

import * as actions from './actions';

/**
 * TestScenario - Fluent builder for e2e test scenarios
 *
 * @example
 * ```typescript
 * const scenario = await TestScenario.create(page)
 *   .withWorkshop({ name: 'My Workshop' })
 *   .withFacilitator()
 *   .withParticipants(2)
 *   .withTraces(5)
 *   .inPhase('discovery')
 *   .build();
 *
 * await scenario.loginAs(scenario.facilitator);
 * ```
 */
export class TestScenario {
  private state: BuilderState;
  private runId: string;

  private constructor(pageOrBrowser: Page | Browser) {
    this.runId = generateRunId();
    this.state = {
      page: 'goto' in pageOrBrowser ? pageOrBrowser : undefined,
      browser: 'newContext' in pageOrBrowser ? pageOrBrowser : undefined,
      mockAll: true,
      realServices: new Set(),
      realEndpoints: new Set(),
      participantConfigs: [],
      smeConfigs: [],
      additionalUsers: [],
      traceCount: 0,
      traceConfigs: [],
      findingConfigs: [],
      annotationConfigs: [],
      discoveryComplete: false,
    };
  }

  /**
   * Create a new test scenario builder
   */
  static create(pageOrBrowser: Page | Browser): TestScenario {
    resetIdCounter();
    return new TestScenario(pageOrBrowser);
  }

  // ========================================
  // Workshop Configuration
  // ========================================

  /**
   * Configure the workshop
   */
  withWorkshop(config?: WorkshopConfig): this {
    this.state.workshopConfig = config || {};
    return this;
  }

  // ========================================
  // User Configuration
  // ========================================

  /**
   * Add a facilitator
   */
  withFacilitator(config?: UserConfig): this {
    this.state.facilitatorConfig = config || {};
    return this;
  }

  /**
   * Add multiple participants
   */
  withParticipants(count: number): this {
    for (let i = 0; i < count; i++) {
      this.state.participantConfigs.push({});
    }
    return this;
  }

  /**
   * Add multiple SMEs
   */
  withSMEs(count: number): this {
    for (let i = 0; i < count; i++) {
      this.state.smeConfigs.push({});
    }
    return this;
  }

  /**
   * Add a user with specific role and config
   */
  withUser(role: UserRole, config?: UserConfig): this {
    this.state.additionalUsers.push({ role, config: config || {} });
    return this;
  }

  // ========================================
  // Data Configuration
  // ========================================

  /**
   * Add traces
   */
  withTraces(count: number): this {
    this.state.traceCount = count;
    return this;
  }

  /**
   * Add specific trace configurations
   */
  withTrace(config: TraceConfig): this {
    this.state.traceConfigs.push(config);
    return this;
  }

  /**
   * Add a rubric
   */
  withRubric(config?: RubricConfig): this {
    this.state.rubricConfig = config || {};
    return this;
  }

  /**
   * Add a discovery finding (useful for setting up rubric phase)
   */
  withDiscoveryFinding(config?: FindingConfig): this {
    this.state.findingConfigs.push(config || {});
    return this;
  }

  /**
   * Mark discovery as complete (for setting up later phases)
   */
  withDiscoveryComplete(): this {
    this.state.discoveryComplete = true;
    return this;
  }

  /**
   * Add an annotation
   */
  withAnnotation(config?: AnnotationConfig): this {
    this.state.annotationConfigs.push(config || {});
    return this;
  }

  // ========================================
  // Phase Configuration
  // ========================================

  /**
   * Set the target phase for the workshop
   */
  inPhase(phase: WorkshopPhase): this {
    this.state.targetPhase = phase;
    return this;
  }

  // ========================================
  // Mock Configuration
  // ========================================

  /**
   * Make a specific service use real API calls
   */
  withReal(serviceOrEndpoint: string): this {
    if (serviceOrEndpoint.startsWith('/')) {
      this.state.realEndpoints.add(serviceOrEndpoint);
    } else {
      this.state.realServices.add(serviceOrEndpoint);
    }
    return this;
  }

  /**
   * Make all API calls real (no mocking)
   */
  withRealApi(): this {
    this.state.mockAll = false;
    return this;
  }

  // ========================================
  // Build
  // ========================================

  /**
   * Build the test scenario
   */
  async build(): Promise<BuiltScenario> {
    // Get or create page
    let page = this.state.page;
    if (!page && this.state.browser) {
      const context = await this.state.browser.newContext();
      page = await context.newPage();
    }
    if (!page) {
      throw new Error('No page or browser provided to TestScenario');
    }

    // Build mock data
    const store = this.buildMockData();

    // Setup mocking if enabled
    if (this.state.mockAll) {
      const mocker = new ApiMocker(page, store);

      // Configure real services/endpoints
      for (const service of this.state.realServices) {
        mocker.addRealService(service);
      }
      for (const endpoint of this.state.realEndpoints) {
        mocker.addRealEndpoint(endpoint);
      }

      await mocker.install();
    }

    // Build the scenario result
    const scenario = this.buildScenarioResult(page, store);

    return scenario;
  }

  /**
   * Build the mock data store
   */
  private buildMockData(): MockDataStore {
    const store: MockDataStore = {
      users: [],
      traces: [],
      findings: [],
      annotations: [],
      discoveryComplete: new Map(),
    };

    // Build workshop
    const workshopBuilder = new WorkshopBuilder();
    if (this.state.workshopConfig?.name) {
      workshopBuilder.withName(this.state.workshopConfig.name);
    }
    if (this.state.workshopConfig?.description) {
      workshopBuilder.withDescription(this.state.workshopConfig.description);
    }
    if (this.state.targetPhase) {
      workshopBuilder.withPhase(this.state.targetPhase);
    }
    store.workshop = workshopBuilder.build();

    // Build facilitator
    if (this.state.facilitatorConfig) {
      const facilitator = new UserBuilder('facilitator')
        .withEmail(
          this.state.facilitatorConfig.email || DEFAULT_FACILITATOR.email
        )
        .withName(
          this.state.facilitatorConfig.name || DEFAULT_FACILITATOR.name
        )
        .withWorkshopId(store.workshop.id)
        .build();

      store.users.push(facilitator);
      store.workshop.facilitator_id = facilitator.id;
    }

    // Build participants
    this.state.participantConfigs.forEach((config, index) => {
      const user = new UserBuilder('participant')
        .withEmail(config.email || generateTestEmail('participant', `${this.runId}-${index}`))
        .withName(config.name || generateTestName('participant', index))
        .withWorkshopId(store.workshop!.id)
        .build();
      store.users.push(user);
    });

    // Build SMEs
    this.state.smeConfigs.forEach((config, index) => {
      const user = new UserBuilder('sme')
        .withEmail(config.email || generateTestEmail('sme', `${this.runId}-${index}`))
        .withName(config.name || generateTestName('sme', index))
        .withWorkshopId(store.workshop!.id)
        .build();
      store.users.push(user);
    });

    // Build additional users
    this.state.additionalUsers.forEach(({ role, config }, index) => {
      const user = new UserBuilder(role)
        .withEmail(config.email || generateTestEmail(role, `${this.runId}-add-${index}`))
        .withName(config.name || generateTestName(role, index))
        .withWorkshopId(store.workshop!.id)
        .build();
      store.users.push(user);
    });

    // Build traces
    const totalTraces = Math.max(this.state.traceCount, this.state.traceConfigs.length);
    for (let i = 0; i < totalTraces; i++) {
      const config = this.state.traceConfigs[i] || {};
      const traceBuilder = new TraceBuilder(i)
        .withWorkshopId(store.workshop!.id)
        .withInput(config.input || SAMPLE_TRACE_INPUTS[i % SAMPLE_TRACE_INPUTS.length])
        .withOutput(config.output || SAMPLE_TRACE_OUTPUTS[i % SAMPLE_TRACE_OUTPUTS.length]);

      if (config.context) {
        traceBuilder.withContext(config.context);
      }

      store.traces.push(traceBuilder.build());
    }

    // Update workshop with trace IDs
    if (store.traces.length > 0 && store.workshop) {
      const traceIds = store.traces.map((t) => t.id);
      if (shouldDiscoveryBeStarted(this.state.targetPhase || 'intake')) {
        store.workshop.active_discovery_trace_ids = traceIds;
      }
      if (shouldAnnotationBeStarted(this.state.targetPhase || 'intake')) {
        store.workshop.active_annotation_trace_ids = traceIds;
      }
    }

    // Build rubric
    if (this.state.rubricConfig) {
      const facilitator = store.users.find((u) => u.role === 'facilitator');
      const rubricBuilder = new RubricBuilder()
        .withWorkshopId(store.workshop!.id)
        .withCreatedBy(facilitator?.id || '');

      if (this.state.rubricConfig.question) {
        rubricBuilder.withQuestion(this.state.rubricConfig.question);
      }
      if (this.state.rubricConfig.judgeType) {
        rubricBuilder.withJudgeType(this.state.rubricConfig.judgeType);
      }
      if (this.state.rubricConfig.ratingScale) {
        rubricBuilder.withRatingScale(this.state.rubricConfig.ratingScale);
      }

      store.rubric = rubricBuilder.build();
    }

    // Build findings
    this.state.findingConfigs.forEach((config, index) => {
      const participant = store.users.find(
        (u) => u.role === 'participant' || u.role === 'sme'
      );
      const trace = config.trace || store.traces[config.traceIndex || 0];

      const finding = new FindingBuilder(index)
        .withWorkshopId(store.workshop!.id)
        .withTraceId(trace?.id || '')
        .withUserId(participant?.id || '')
        .withInsight(config.insight || SAMPLE_INSIGHTS[index % SAMPLE_INSIGHTS.length])
        .build();

      store.findings.push(finding);
    });

    // Mark discovery complete if configured
    if (this.state.discoveryComplete) {
      store.users
        .filter((u) => u.role === 'participant' || u.role === 'sme')
        .forEach((u) => store.discoveryComplete.set(u.id, true));
    }

    // Build annotations
    this.state.annotationConfigs.forEach((config) => {
      const participant = store.users.find(
        (u) => u.role === 'participant' || u.role === 'sme'
      );
      const trace = config.trace || store.traces[config.traceIndex || 0];

      const annotation = new AnnotationBuilder()
        .withWorkshopId(store.workshop!.id)
        .withTraceId(trace?.id || '')
        .withUserId(participant?.id || '')
        .withRating(config.rating || 4);

      if (config.ratings) {
        annotation.withRatings(config.ratings);
      }
      if (config.comment) {
        annotation.withComment(config.comment);
      }

      store.annotations.push(annotation.build());
    });

    return store;
  }

  /**
   * Build the scenario result object with actions
   */
  private buildScenarioResult(page: Page, store: MockDataStore): BuiltScenario {
    const apiUrl = DEFAULT_API_URL;
    const contexts: BrowserContext[] = [];

    // Organize users by role
    const usersByRole: UsersByRole = {
      facilitator: store.users.filter((u) => u.role === 'facilitator'),
      sme: store.users.filter((u) => u.role === 'sme'),
      participant: store.users.filter((u) => u.role === 'participant'),
    };

    // Build page-scoped actions
    const buildPageActions = (targetPage: Page): PageActions => ({
      loginAs: (user: User) => actions.loginAs(targetPage, user),
      logout: () => actions.logout(targetPage),
      goToPhase: (phase: WorkshopPhase) => actions.goToPhase(targetPage, phase),
      goToTab: (tabName: string) => actions.goToTab(targetPage, tabName),
      createRubricQuestion: async (config: RubricConfig) => {
        await actions.createRubricQuestion(targetPage, config);
        return store.rubric!;
      },
      submitFinding: async (config: FindingConfig) => {
        await actions.submitFinding(targetPage, {
          trace: config.trace || store.traces[config.traceIndex || 0],
          insight: config.insight || SAMPLE_INSIGHTS[0],
        });
        return store.findings[store.findings.length - 1];
      },
      submitAnnotation: async (config: AnnotationConfig) => {
        await actions.submitAnnotation(targetPage, config);
        return store.annotations[store.annotations.length - 1];
      },
      completeDiscovery: () => actions.completeDiscovery(targetPage),
    });

    // Build API accessor
    const api: ScenarioApi = {
      getWorkshop: async () => {
        const response = await page.request.get(
          `${apiUrl}/workshops/${store.workshop!.id}`
        );
        return (await response.json()) as Workshop;
      },
      getRubric: async () => {
        const response = await page.request.get(
          `${apiUrl}/workshops/${store.workshop!.id}/rubric`
        );
        if (response.status() === 404) return null;
        return (await response.json()) as Rubric;
      },
      getTraces: async () => {
        const response = await page.request.get(
          `${apiUrl}/workshops/${store.workshop!.id}/all-traces`
        );
        return (await response.json()) as Trace[];
      },
      getFindings: async (userId?: string) => {
        const url = userId
          ? `${apiUrl}/workshops/${store.workshop!.id}/findings?user_id=${userId}`
          : `${apiUrl}/workshops/${store.workshop!.id}/findings`;
        const response = await page.request.get(url);
        return (await response.json()) as DiscoveryFinding[];
      },
      getAnnotations: async (userId?: string) => {
        const url = userId
          ? `${apiUrl}/workshops/${store.workshop!.id}/annotations?user_id=${userId}`
          : `${apiUrl}/workshops/${store.workshop!.id}/annotations`;
        const response = await page.request.get(url);
        return (await response.json()) as Annotation[];
      },
      getDiscoveryCompletionStatus: async () => {
        const response = await page.request.get(
          `${apiUrl}/workshops/${store.workshop!.id}/discovery-completion-status`
        );
        return (await response.json()) as {
          total_participants: number;
          completed_participants: number;
          all_completed: boolean;
        };
      },
    };

    const scenario: BuiltScenario = {
      page,
      browser: this.state.browser,
      workshop: store.workshop!,
      facilitator: usersByRole.facilitator[0],
      users: usersByRole,
      traces: store.traces,
      rubric: store.rubric,
      findings: store.findings,
      annotations: store.annotations,

      // Actions on main page
      loginAs: (user: User) => actions.loginAs(page, user),
      logout: () => actions.logout(page),
      advanceToPhase: (phase: WorkshopPhase) =>
        actions.advanceToPhase(page, store.workshop!.id, phase, apiUrl),
      goToPhase: (phase: WorkshopPhase) => actions.goToPhase(page, phase),
      goToTab: (tabName: string) => actions.goToTab(page, tabName),
      createRubricQuestion: async (config: RubricConfig) => {
        await actions.createRubricQuestion(page, config);
        // Fetch the created rubric from API or return mock
        if (this.state.mockAll) {
          return store.rubric!;
        }
        return (await api.getRubric())!;
      },
      submitFinding: async (config: FindingConfig) => {
        await actions.submitFinding(page, {
          trace: config.trace || store.traces[config.traceIndex || 0],
          insight: config.insight || SAMPLE_INSIGHTS[0],
        });
        return store.findings[store.findings.length - 1];
      },
      submitAnnotation: async (config: AnnotationConfig) => {
        await actions.submitAnnotation(page, config);
        return store.annotations[store.annotations.length - 1];
      },
      completeDiscovery: () => actions.completeDiscovery(page),

      // Multi-browser support
      newPageAs: async (user: User) => {
        if (!this.state.browser) {
          throw new Error('Browser required for newPageAs - use browser fixture');
        }
        const context = await this.state.browser.newContext();
        contexts.push(context);
        const newPage = await context.newPage();

        // Setup mocking on new page if needed
        if (this.state.mockAll) {
          const mocker = new ApiMocker(newPage, store);
          for (const service of this.state.realServices) {
            mocker.addRealService(service);
          }
          for (const endpoint of this.state.realEndpoints) {
            mocker.addRealEndpoint(endpoint);
          }
          await mocker.install();
        }

        // Login as user
        await actions.loginAs(newPage, user);

        return newPage;
      },

      using: (targetPage: Page) => buildPageActions(targetPage),

      api,

      cleanup: async () => {
        // Close all created contexts
        for (const context of contexts) {
          await context.close();
        }
      },
    };

    return scenario;
  }
}
