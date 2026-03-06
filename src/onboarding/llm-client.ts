/**
 * Direct Anthropic Claude API client for guided-mode questions.
 *
 * Patient-core makes its own LLM API calls — OpenClaw is message bus only.
 * Uses ANTHROPIC_API_KEY from env (injected by OpenClaw's openclaw.json).
 */

import type { FormQuestion } from './questionnaire-schema.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
}

// ---------------------------------------------------------------------------
// LLM Client
// ---------------------------------------------------------------------------

export class PatientLLMClient {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey ?? process.env['ANTHROPIC_API_KEY'] ?? '';
    this.model = model ?? 'claude-sonnet-4-20250514';
  }

  /**
   * Present a guided-mode question conversationally.
   *
   * Uses the question's llm_guidance to craft a warm, health-literacy-aware
   * presentation. Returns the formatted question text for the patient.
   */
  async presentQuestion(
    question: FormQuestion,
    healthLiteracy: string,
    conversationHistory: AnthropicMessage[],
  ): Promise<string> {
    if (!this.apiKey) {
      // Fallback: return raw question text if no API key
      return question.text;
    }

    const systemPrompt = [
      'You are a patient health assistant helping with onboarding.',
      `The patient prefers ${healthLiteracy} medical explanations.`,
      'Be warm, supportive, and clear.',
      'Ask the question naturally as part of a conversation.',
      'Do not add extra questions beyond what is specified.',
      question.llm_guidance ? `Guidance: ${question.llm_guidance}` : '',
    ].filter(Boolean).join(' ');

    const messages: AnthropicMessage[] = [
      ...conversationHistory,
      {
        role: 'user',
        content: `Present this question to the patient: "${question.text}"`,
      },
    ];

    try {
      const response = await this.callAnthropic(systemPrompt, messages);
      return response || question.text;
    } catch {
      return question.text;
    }
  }

  /**
   * Parse a patient's natural language answer for a guided-mode question.
   *
   * Extracts the structured answer from the patient's conversational response.
   */
  async parseAnswer(
    question: FormQuestion,
    patientResponse: string,
  ): Promise<string> {
    if (!this.apiKey) {
      return patientResponse;
    }

    const systemPrompt = [
      'Extract the patient\'s answer from their response.',
      'Return ONLY the extracted information, nothing else.',
      `The question was: "${question.text}"`,
      question.llm_guidance ? `Context: ${question.llm_guidance}` : '',
      'If the patient listed multiple items, format as a comma-separated list.',
    ].filter(Boolean).join(' ');

    const messages: AnthropicMessage[] = [
      { role: 'user', content: patientResponse },
    ];

    try {
      const response = await this.callAnthropic(systemPrompt, messages);
      return response || patientResponse;
    } catch {
      return patientResponse;
    }
  }

  private async callAnthropic(
    system: string,
    messages: AnthropicMessage[],
  ): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 512,
        system,
        messages,
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic API error: ${res.status}`);
    }

    const body = (await res.json()) as AnthropicResponse;
    const textBlock = body.content.find((c) => c.type === 'text');
    return textBlock?.text ?? '';
  }
}
