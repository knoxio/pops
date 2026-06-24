/**
 * Plan entry + slot errors. Re-exported from `errors.ts`, which is the
 * barrel consumers import from.
 */

export class PlanEntryNotFound extends Error {
  readonly planEntryId: number;

  constructor(planEntryId: number) {
    super(`Plan entry #${planEntryId} not found`);
    this.name = 'PlanEntryNotFound';
    this.planEntryId = planEntryId;
  }
}

export class PlanEntryHasCookEvent extends Error {
  readonly planEntryId: number;
  readonly recipeRunId: number;

  constructor(planEntryId: number, recipeRunId: number) {
    super(
      `Plan entry #${planEntryId} cannot be deleted — it has been cooked (recipe_run #${recipeRunId}).`
    );
    this.name = 'PlanEntryHasCookEvent';
    this.planEntryId = planEntryId;
    this.recipeRunId = recipeRunId;
  }
}

export class PlanSlotNotFound extends Error {
  readonly slug: string;

  constructor(slug: string) {
    super(`Plan slot "${slug}" not found`);
    this.name = 'PlanSlotNotFound';
    this.slug = slug;
  }
}

export class PlanSlotIsDefault extends Error {
  readonly slug: string;

  constructor(slug: string) {
    super(`Plan slot "${slug}" is a seeded default and cannot be deleted.`);
    this.name = 'PlanSlotIsDefault';
    this.slug = slug;
  }
}

export class PlanSlotInUse extends Error {
  readonly slug: string;
  readonly entryCount: number;

  constructor(slug: string, entryCount: number) {
    super(
      `Plan slot "${slug}" is in use by ${entryCount} plan entr${entryCount === 1 ? 'y' : 'ies'} and cannot be deleted.`
    );
    this.name = 'PlanSlotInUse';
    this.slug = slug;
    this.entryCount = entryCount;
  }
}

export class PlanSlotSlugAlreadyExists extends Error {
  readonly slug: string;

  constructor(slug: string) {
    super(`Plan slot "${slug}" already exists.`);
    this.name = 'PlanSlotSlugAlreadyExists';
    this.slug = slug;
  }
}
