import { GoogleGenAI, type Content } from '@google/genai';
import {
  COPILOT_FUNCTION_DECLARATIONS,
  executeReadTool,
  preparePendingWriteAction,
  READ_TOOL_NAMES,
  WRITE_TOOL_NAMES,
  type PendingCopilotAction,
} from './copilot-tools.ts';
import type { SessionPrincipal } from './types.ts';

const SYSTEM_INSTRUCTION = `You are the RISA Sponsorship Growth Copilot for CampusFest 2025 (Delhi Tier-1).

STRICT DETERMINISM & GROUNDING CONTRACT:
1. NEVER state or invent any count, INR amount, percentage, deal, or campaign metric without calling the relevant read tool in THIS turn to verify live state.
2. Always call deterministic read tools (getFunnel, getCash, getCashBreakdown, getCampaignPerf, getPipeline, getTargetsVsActuals, getBottlenecks, getActivations, getBrandDetails, getWorkforceLoad, getIndustryBreakdown, getEventPackages, getEventReadiness, getTargetCompanies, getMyAssignedWork) and quote exact values from their JSON outputs.
3. RESPECT ROLE SCOPE: If any tool returns access_denied for the caller's role (e.g. coordinator), explicitly inform the user that org-wide financial/workforce data is restricted to Managers and Heads, and offer to show their assigned tasks or target companies instead.
4. DISTINGUISH POPULATIONS & MONEY STATES: outreach attempts != contacts != engaged/responded != qualified != confirmed partners. Also proposed_value_inr != confirmed_value_inr != cash vs in_kind != collected_value_inr.
5. ASSOCIATION != CAUSATION: Sponsor activations record observational links only and CANNOT establish causal attendance uplift.
6. HONEST UNCERTAINTY: If data is missing (e.g. ticket prices, competitor spend, causal impact), state clearly what the dataset cannot answer.
7. CONFIRM-GATED WRITES: Write tools (createTask, updateOpportunityStage, reassignOpportunityOwner, reserveEventPackage, generateDealChecklist) only queue a preview for user confirmation.

RESPONSE FORMAT (EXECUTIVE MARKDOWN):
Structure every non-trivial answer cleanly in Markdown:
- **Direct Answer:** 1–2 concise sentences with the headline INR/count answer.
- **Evidence Breakdown:** A compact Markdown table (when comparing 2+ items) or clean bullet points citing exact tool numbers.
- **Recommended Action:** Specific next step (named owner, package, or target company).
- **Scope & Caveats:** Brief note on cash vs in-kind, association vs causation, or role scope if relevant.`;

export interface AnalystMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function runGroundedAnalyst(params: {
  messages: AnalystMessage[];
  principal: SessionPrincipal;
  asOf?: string | null;
  channel?: 'dashboard' | 'whatsapp';
}): Promise<{
  reply: string;
  model: string;
  toolTrace: Array<{ tool: string; args: Record<string, unknown> }>;
  pendingActions: PendingCopilotAction[];
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.includes('your-gemini-api-key')) {
    const err = new Error('GEMINI_API_KEY is not configured in .env.local') as Error & {
      status?: number;
    };
    err.status = 503;
    throw err;
  }

  const recentMessages = params.messages.slice(-12);
  const asOfNote =
    params.asOf && /^\d{4}-\d{2}-\d{2}$/.test(params.asOf)
      ? `, asOf=${params.asOf}`
      : '';
  const callerContext = `[Caller: ${params.principal.full_name}, role=${params.principal.role}, channel=${params.channel ?? 'dashboard'}${asOfNote}]`;

  const contents: Content[] = recentMessages.map((m, idx) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [
      {
        text:
          idx === recentMessages.length - 1 && m.role === 'user'
            ? `${m.content}\n\n${callerContext}`
            : m.content,
      },
    ],
  }));

  const modelName = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite';
  const ai = new GoogleGenAI({ vertexai: false, apiKey });

  const toolTrace: Array<{ tool: string; args: Record<string, unknown> }> = [];
  const pendingActions: PendingCopilotAction[] = [];

  const MAX_STEPS = 5;
  let finalReply = '';

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await Promise.race([
      ai.models.generateContent({
        model: modelName,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.1,
          tools: [{ functionDeclarations: COPILOT_FUNCTION_DECLARATIONS }],
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API request timed out after 25s')), 25_000)
      ),
    ]);

    const candidateContent = response.candidates?.[0]?.content;
    if (candidateContent) {
      contents.push(candidateContent);
    }

    const calls = response.functionCalls ?? [];
    if (calls.length === 0) {
      finalReply = response.text?.trim() || '';
      break;
    }

    const responseParts: Array<{
      functionResponse: { name: string; response: Record<string, unknown> };
    }> = [];

    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      const toolName = call.name ?? '';
      const args = (call.args ?? {}) as Record<string, unknown>;
      toolTrace.push({ tool: toolName, args });

      if (READ_TOOL_NAMES.has(toolName)) {
        try {
          const result = await executeReadTool(toolName, args, params.principal);
          responseParts.push({
            functionResponse: { name: toolName, response: { result } },
          });
        } catch (err) {
          responseParts.push({
            functionResponse: {
              name: toolName,
              response: { error: err instanceof Error ? err.message : 'Tool failed' },
            },
          });
        }
      } else if (WRITE_TOOL_NAMES.has(toolName)) {
        const { pending, toolResultForModel } = await preparePendingWriteAction(
          toolName,
          args,
          i,
          params.principal
        );
        if (pending) pendingActions.push(pending);
        responseParts.push({
          functionResponse: { name: toolName, response: { result: toolResultForModel } },
        });
      } else {
        responseParts.push({
          functionResponse: { name: toolName, response: { error: `Unknown tool: ${toolName}` } },
        });
      }
    }

    contents.push({ role: 'user', parts: responseParts });
  }

  if (!finalReply) {
    finalReply =
      pendingActions.length > 0
        ? 'I have prepared the requested update below. Please review and click **Confirm & Execute** to save it.'
        : 'I could not complete a grounded response within the tool step budget. Please try rephrasing your question.';
  }

  return { reply: finalReply, model: modelName, toolTrace, pendingActions };
}
