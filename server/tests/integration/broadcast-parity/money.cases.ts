import { addTripMember } from '../../helpers/factories/trips';
import type { CaseGroup } from './types';
import { MikroORM } from '@mikro-orm/core';

const TEMPLATES = "packing templates are the admin's global list: no trip room, and no screen shows them live";

/** Money and lists: the budget with its settlements, packing and to-dos. */
export const money: CaseGroup = {
  name: 'money',
  prefix: 'BCP-MONEY',
  cases: [],
  exempt: [
    {
      tool: 'save_packing_template',
      reason: TEMPLATES,
      actor: 'admin',
      needs: ['packingItem'],
      // Saving reads a trip's list, so the admin travels along on this one.
      setup: (s, app) => addTripMember(app.get(MikroORM), s.trip.id, s.admin.id, s.owner.id),
      args: (s) => ({ tripId: s.trip.id, templateName: `Beach ${s.n}` }),
    },
    {
      tool: 'delete_packing_template',
      reason: TEMPLATES,
      actor: 'admin',
      needs: ['template'],
      args: (s) => ({ templateId: s.template.id }),
    },
  ],
  pending: [
    'create_budget_item',
    'delete_budget_item',
    'update_budget_item',
    'create_budget_item_with_members',
    'set_budget_item_members',
    'toggle_budget_member_paid',
    'create_settlement',
    'update_settlement',
    'delete_settlement',
    'freeze_budget_rates',
    'create_packing_item',
    'toggle_packing_item',
    'delete_packing_item',
    'update_packing_item',
    'set_packing_item_sharing',
    'reorder_packing_items',
    'create_packing_bag',
    'update_packing_bag',
    'delete_packing_bag',
    'set_bag_members',
    'set_packing_category_assignees',
    'apply_packing_template',
    'bulk_import_packing',
    'create_todo',
    'update_todo',
    'toggle_todo',
    'delete_todo',
    'reorder_todos',
    'set_todo_category_assignees',
  ],
};
