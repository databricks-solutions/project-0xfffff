import type { Page } from '@playwright/test';

export type { User } from '../../src/client/models/User';
export { UserRole } from '../../src/client/models/UserRole';
export type { UserPermissions } from '../../src/client/models/UserPermissions';
export type { ProjectSetupState } from '../../src/client/models/ProjectSetupState';

import type { User } from '../../src/client/models/User';
import type { ProjectSetupState } from '../../src/client/models/ProjectSetupState';

export interface BuiltScenario {
  page: Page;
  facilitator: User;
  projectSetup: ProjectSetupState;
  loginAs(user: User): Promise<void>;
  cleanup(): Promise<void>;
}
