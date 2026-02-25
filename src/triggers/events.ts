import type { ISdk } from 'iii-sdk'
import { getContext } from 'iii-sdk'
import type { HookPayload } from '../types.js'

export function registerEventTriggers(sdk: ISdk): void {

  sdk.registerFunction(
    { id: 'event::session::started', description: 'Handle session start event' },
    async (data: { sessionId: string; project: string; cwd: string }) => {
      const ctx = getContext()
      ctx.logger.info('Session start event', { sessionId: data.sessionId })
      return await sdk.trigger('api::session::start', {
        body: data,
        headers: {},
        method: 'POST',
        path_params: {},
        query_params: {},
      })
    }
  )
  sdk.registerTrigger({
    type: 'queue',
    function_id: 'event::session::started',
    config: { topic: 'agentmemory.session.started' },
  })

  sdk.registerFunction(
    { id: 'event::observation', description: 'Handle new observation event' },
    async (data: HookPayload) => {
      const ctx = getContext()
      ctx.logger.info('Observation event', { sessionId: data.sessionId, hook: data.hookType })
      return await sdk.trigger('mem::observe', data)
    }
  )
  sdk.registerTrigger({
    type: 'queue',
    function_id: 'event::observation',
    config: { topic: 'agentmemory.observation' },
  })

  sdk.registerFunction(
    { id: 'event::session::stopped', description: 'Handle stop event (trigger summarize)' },
    async (data: { sessionId: string }) => {
      const ctx = getContext()
      ctx.logger.info('Session stop event, triggering summarize', { sessionId: data.sessionId })
      return await sdk.trigger('mem::summarize', data)
    }
  )
  sdk.registerTrigger({
    type: 'queue',
    function_id: 'event::session::stopped',
    config: { topic: 'agentmemory.session.stopped' },
  })

  sdk.registerFunction(
    { id: 'event::session::ended', description: 'Handle session end event' },
    async (data: { sessionId: string }) => {
      const ctx = getContext()
      ctx.logger.info('Session end event', { sessionId: data.sessionId })
      return await sdk.trigger('api::session::end', {
        body: data,
        headers: {},
        method: 'POST',
        path_params: {},
        query_params: {},
      })
    }
  )
  sdk.registerTrigger({
    type: 'queue',
    function_id: 'event::session::ended',
    config: { topic: 'agentmemory.session.ended' },
  })
}
