import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk'
import type { MemoryProvider } from '../types.js'
import { getEnvVar } from '../config.js'

/**
 * AWS Bedrock LLM provider (Anthropic models on Bedrock).
 *
 * Wraps `@anthropic-ai/bedrock-sdk`, which speaks the same
 * `messages.create(...)` surface as the first-party Anthropic SDK but
 * authenticates with AWS SigV4 instead of an `x-api-key` header.
 *
 * Credentials: by default NO explicit keys are passed, so the AWS SDK v3
 * default credential provider chain resolves them — environment creds, IAM
 * roles, and crucially **SSO profiles** cached under `~/.aws/sso/cache/`
 * (select with `AWS_PROFILE`). The SDK reads a cached SSO token; it cannot
 * perform the interactive `aws sso login` itself, so the session must already
 * be valid. Static keys (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`) are an
 * opt-in escape hatch for CI.
 *
 * Required env:
 *   AWS_REGION  — Bedrock region (also consumed by the SDK directly).
 *
 * Optional:
 *   AWS_BEDROCK_MODEL          — model / inference-profile ID (default below).
 *   AWS_PROFILE            — SSO/credentials profile, consumed by the AWS SDK.
 *   AWS_ACCESS_KEY_ID      — explicit static key (escape hatch / CI).
 *   AWS_SECRET_ACCESS_KEY  — explicit static secret (escape hatch / CI).
 *   AWS_SESSION_TOKEN      — explicit session token for temporary creds.
 *
 * Model IDs are Bedrock-style (e.g. `anthropic.claude-haiku-4-5-20251001-v1:0`),
 * NOT the bare Anthropic model name. In Regions where the model is not offered
 * on-demand it is reachable only via a cross-region inference profile, whose ID
 * is geo-prefixed: `us.anthropic.claude-haiku-4-5-20251001-v1:0` (or `eu.`).
 */
export class BedrockProvider implements MemoryProvider {
  name = 'bedrock'
  private client: AnthropicBedrock
  private model: string
  private maxTokens: number

  constructor(model: string, maxTokens: number, awsRegion: string) {
    const awsAccessKey = getEnvVar('AWS_ACCESS_KEY_ID')
    const awsSecretKey = getEnvVar('AWS_SECRET_ACCESS_KEY')
    const awsSessionToken = getEnvVar('AWS_SESSION_TOKEN')

    // Only pass explicit keys when BOTH are present — otherwise omit them so the
    // AWS credential provider chain (env / IAM role / SSO cache) resolves creds.
    this.client =
      awsAccessKey && awsSecretKey
        ? new AnthropicBedrock({
            awsRegion,
            awsAccessKey,
            awsSecretKey,
            ...(awsSessionToken ? { awsSessionToken } : {}),
          })
        : new AnthropicBedrock({ awsRegion })
    this.model = model
    this.maxTokens = maxTokens
  }

  async compress(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call(systemPrompt, userPrompt)
  }

  async summarize(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call(systemPrompt, userPrompt)
  }

  async describeImage(imageData: string, mimeType: string, prompt: string): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp', data: imageData },
            },
            { type: 'text', text: prompt },
          ],
        }],
      })

      const textBlock = response.content.find((b) => b.type === 'text')
      return textBlock?.text ?? ''
    } catch (err) {
      throw this.explainError(err)
    }
  }

  private async call(systemPrompt: string, userPrompt: string): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      })

      const textBlock = response.content.find((b) => b.type === 'text')
      return textBlock?.text ?? ''
    } catch (err) {
      throw this.explainError(err)
    }
  }

  /**
   * Turn an opaque Bedrock model-access / validation 4xx into an actionable
   * error. The bare on-demand model ID only works in Regions that offer the
   * model on-demand; elsewhere callers must enable model access or switch to a
   * `us.`/`eu.`-prefixed cross-region inference profile.
   */
  private explainError(err: unknown): unknown {
    const status = (err as { status?: number })?.status
    const message = err instanceof Error ? err.message : String(err)
    if (
      status === 403 ||
      status === 400 ||
      /access|not authorized|inference profile|on-demand|ValidationException|AccessDenied/i.test(message)
    ) {
      return new Error(
        `Bedrock model "${this.model}" could not be invoked (${message}). ` +
          `Check that: (1) model access is enabled for this account in the Bedrock console, ` +
          `(2) AWS_REGION (${this.client.awsRegion}) offers this model, and ` +
          `(3) for Regions without on-demand access, AWS_BEDROCK_MODEL is set to the ` +
          `"us."/"eu."-prefixed cross-region inference profile ID.`,
      )
    }
    return err
  }
}
