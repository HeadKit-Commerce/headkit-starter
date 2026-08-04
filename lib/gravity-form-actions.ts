"use server";

import sanitizeHtml from "sanitize-html";
import {
  executeRequest,
  HEADKIT_GRAPHQL_URL,
  GetGravityFormDocument,
  SubmitGravityFormDocument,
  type GetGravityFormQuery,
  type SubmitGravityFormMutation,
} from "@headkit/sdk";
import { env } from "@/lib/env";

/**
 * Gravity Forms server actions.
 *
 * Uses the @headkit/sdk transport layer to call the GraphQL gateway.
 * The commerce subgraph exposes gravity-forms operations:
 *   - Query:    commerce { gfForm(id: ID!) { ... } }
 *   - Mutation: commerce { submitGfForm(input: SubmitGfFormInput!) { ... } }
 */

const GRAPHQL_URL = env.NEXT_PUBLIC_GRAPHQL_URL ?? HEADKIT_GRAPHQL_URL;

function transportOpts() {
  const apiKey = env.HEADKIT_PRIVATE_KEY;
  if (!apiKey) throw new Error("HEADKIT_PRIVATE_KEY is not configured");
  return { url: GRAPHQL_URL, apiKey };
}

// Re-export the GravityForm type shape the component expects
export type GravityFormData = {
  gfForm: GetGravityFormQuery["commerce"]["gfForm"];
};

export type SubmitGravityFormInput = {
  id: string;
  saveAsDraft: boolean;
  fieldValues: Array<{ id?: number; value: string }>;
};

export type SubmitGravityFormResult = {
  submitGfForm: SubmitGravityFormMutation["commerce"]["submitGfForm"];
};

export async function getGravityFormById(id: string): Promise<GravityFormData> {
  const data = await executeRequest(transportOpts(), GetGravityFormDocument, {
    id,
  });
  return { gfForm: data.commerce.gfForm };
}

export async function submitGravityForm(
  input: SubmitGravityFormInput,
): Promise<SubmitGravityFormResult> {
  const data = await executeRequest(
    transportOpts(),
    SubmitGravityFormDocument,
    {
      input: {
        id: input.id,
        saveAsDraft: input.saveAsDraft,
        fieldValues: input.fieldValues.map((fv) =>
          fv.id !== undefined
            ? { id: fv.id, value: fv.value }
            : { value: fv.value },
        ),
      },
    },
  );
  const submitGfForm = data.commerce.submitGfForm;
  // Strip the GF confirmation message to plain text here (server) rather than
  // in the client component: the client renders it as React text anyway, and
  // doing it here keeps sanitize-html (htmlparser2, ~70 KB gz) out of the
  // browser bundle (RC-1 perf fix).
  if (submitGfForm?.confirmation?.message) {
    submitGfForm.confirmation.message = sanitizeHtml(
      submitGfForm.confirmation.message,
      { allowedTags: [], allowedAttributes: {} },
    );
  }
  return { submitGfForm };
}
