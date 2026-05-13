# E2E Test Patterns

## TestScenario Builder API

Location: `client/tests/lib/`

### Basic Usage

```typescript
import { test, expect } from '@playwright/test';
import { TestScenario } from './lib';

test('facilitator can create a rubric', async ({ page }) => {
  const scenario = await TestScenario.create(page)
    .withWorkshop({ name: 'My Workshop' })
    .withFacilitator()
    .withParticipants(2)
    .withTraces(5)
    .inPhase('rubric')
    .build();

  await scenario.loginAs(scenario.facilitator);
  await expect(page.getByRole('heading', { name: 'My Workshop' })).toBeVisible();
  await scenario.cleanup();
});
```

### Workshop Configuration

```typescript
.withWorkshop()                              // Default workshop
.withWorkshop({ name: 'Custom Name' })       // Named workshop
.withWorkshop({ name: 'W', description: 'D' }) // With description
```

### User Configuration

```typescript
.withFacilitator()                           // Default facilitator
.withFacilitator({ email: 'a@b.com' })       // Custom email
.withParticipants(3)                         // 3 participants
.withSMEs(2)                                 // 2 SME users
.withUser('participant', { name: 'Alice' }) // Named user
```

### Data Configuration

```typescript
.withTraces(5)                               // 5 mock traces
.withRubric({ question: 'How helpful?' })    // Add rubric
.withDiscoveryFinding({ insight: '...' })    // Add finding
.withDiscoveryComplete()                     // Mark discovery done
.withAnnotation({ rating: 4, comment: '...' }) // Add annotation
```

### Phase Configuration

```typescript
.inPhase('intake')       // Initial phase
.inPhase('discovery')    // Discovery phase
.inPhase('rubric')       // Rubric creation
.inPhase('annotation')   // Annotation phase
.inPhase('results')      // Results phase
```

### Mock vs Real API

```typescript
// Default: everything mocked
.build()

// Selective real endpoints
.withReal('/users/auth/login')
.withReal('WorkshopsService')

// No mocking (full integration)
.withRealApi()
```

## Accessing Scenario Data

```typescript
scenario.workshop           // Workshop object
scenario.facilitator        // First facilitator
scenario.users.participant  // Array of participants
scenario.users.sme          // Array of SMEs
scenario.traces             // Array of traces
scenario.rubric             // Rubric (if created)
scenario.findings           // Discovery findings
scenario.annotations        // Annotations
```

## Actions

```typescript
// Authentication
await scenario.loginAs(scenario.facilitator);
await scenario.logout();

// Navigation
await scenario.goToPhase('discovery');
await scenario.goToTab('Rubric Questions');

// API-level phase advancement
await scenario.advanceToPhase('rubric');

// Data creation
await scenario.createRubricQuestion({ question: '...' });
await scenario.submitFinding({ trace: scenario.traces[0], insight: '...' });
await scenario.submitAnnotation({ rating: 4 });
await scenario.completeDiscovery();
```

## Multi-Browser Tests

```typescript
test('multi-user workflow', async ({ browser }) => {
  const scenario = await TestScenario.create(browser)
    .withWorkshop()
    .withFacilitator()
    .withParticipants(2)
    .build();

  const facilitatorPage = await scenario.newPageAs(scenario.facilitator);
  const alicePage = await scenario.newPageAs(scenario.users.participant[0]);

  // Actions scoped to a page
  await scenario.using(alicePage).submitFinding({ ... });
});
```

## API Access for Assertions

```typescript
const workshop = await scenario.api.getWorkshop();
const rubric = await scenario.api.getRubric();
const traces = await scenario.api.getTraces();
const findings = await scenario.api.getFindings(userId);
const annotations = await scenario.api.getAnnotations();
const status = await scenario.api.getDiscoveryCompletionStatus();
```

## Running E2E Tests

```bash
just e2e              # Headless
just e2e headed       # Visible browser
just e2e ui           # Playwright UI mode
```
