/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as admin from "../admin.js";
import type * as agreements from "../agreements.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as documentFont from "../documentFont.js";
import type * as documents from "../documents.js";
import type * as engine from "../engine.js";
import type * as http from "../http.js";
import type * as integrations from "../integrations.js";
import type * as jobs from "../jobs.js";
import type * as operations from "../operations.js";
import type * as payments from "../payments.js";
import type * as pdf from "../pdf.js";
import type * as portal from "../portal.js";
import type * as presentation from "../presentation.js";
import type * as proposals from "../proposals.js";
import type * as retention from "../retention.js";
import type * as seed from "../seed.js";
import type * as staging from "../staging.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  admin: typeof admin;
  agreements: typeof agreements;
  auth: typeof auth;
  crons: typeof crons;
  documentFont: typeof documentFont;
  documents: typeof documents;
  engine: typeof engine;
  http: typeof http;
  integrations: typeof integrations;
  jobs: typeof jobs;
  operations: typeof operations;
  payments: typeof payments;
  pdf: typeof pdf;
  portal: typeof portal;
  presentation: typeof presentation;
  proposals: typeof proposals;
  retention: typeof retention;
  seed: typeof seed;
  staging: typeof staging;
  webhooks: typeof webhooks;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
