import { z } from 'zod';
import { CURRENCIES, MAX_AMOUNT_CENTS } from '../../shared/src/money.js';
import { SPLIT_MODES } from '../../shared/src/splits.js';
import { CATEGORY_IDS } from '../../shared/src/categories.js';

const id = z.number().int().positive();
const cents = z.number().int().positive().max(MAX_AMOUNT_CENTS);
const name = z.string().trim().min(1, 'Name is required').max(60);
const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')).pipe(z.string().max(120));

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), 'Not a real date');

export const registerSchema = z.object({
  name,
  email,
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(200),
});

export const addFriendSchema = z.object({ name, email });

export const createGroupSchema = z.object({
  name,
  members: z.array(z.object({ name, email })).max(30).default([]),
});

export const updateGroupSchema = z
  .object({ name: name.optional(), simplifyDebts: z.boolean().optional() })
  .refine((v) => v.name !== undefined || v.simplifyDebts !== undefined, 'Nothing to update');

export const addMemberSchema = z.union([z.object({ userId: id }), z.object({ name, email })]);

export const expenseSchema = z
  .object({
    groupId: id.nullable(),
    description: z.string().trim().min(1, 'Add a description').max(100),
    amountCents: cents,
    currency: z.enum(CURRENCIES),
    category: z.enum(CATEGORY_IDS).default('general'),
    date: isoDate,
    paidBy: id,
    splitMode: z.enum(SPLIT_MODES),
    splits: z
      .array(z.object({ userId: id, value: z.number().int().min(0).max(MAX_AMOUNT_CENTS) }))
      .min(1, 'Choose at least one person to split with')
      .max(50),
  })
  .superRefine((v, ctx) => {
    if (v.splitMode === 'percent' && v.splits.some((s) => s.value > 10_000)) {
      ctx.addIssue({ code: 'custom', path: ['splits'], message: 'A percentage cannot exceed 100%' });
    }
    if (v.splitMode === 'shares' && v.splits.some((s) => s.value > 1000)) {
      ctx.addIssue({ code: 'custom', path: ['splits'], message: 'Use at most 1000 shares per person' });
    }
  });
export type ExpenseInput = z.infer<typeof expenseSchema>;

export const settlementSchema = z
  .object({
    groupId: id.nullable(),
    fromUserId: id,
    toUserId: id,
    amountCents: cents,
    currency: z.enum(CURRENCIES),
    date: isoDate,
  })
  .refine((v) => v.fromUserId !== v.toUserId, { message: 'Payer and recipient must be different people', path: ['toUserId'] });
export type SettlementInput = z.infer<typeof settlementSchema>;
