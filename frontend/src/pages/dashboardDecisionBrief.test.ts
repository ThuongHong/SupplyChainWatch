import { describe, expect, it } from 'vitest'
import { buildDecisionBrief } from './dashboardDecisionBrief'

const basePort = {
  entity_id: 'port-cnsha',
  entity_name: 'Shanghai',
  entity_type: 'port' as const,
  score: 86,
  severity: 'high',
  component_scores: {},
  freshness_status: 'fresh',
  as_of: '2026-05-26T00:00:00Z',
}

describe('buildDecisionBrief', () => {
  it('focuses the headline and first action on a high-risk port', () => {
    const brief = buildDecisionBrief({
      topPort: basePort,
      topPortDetail: 'Port calls are above baseline.',
      hasLiveRiskRows: true,
      highAnomalies: 2,
      staleSources: 0,
      propagationLinks: 0,
      riskForecastDirection: null,
      topStoryNarrative: null,
    })

    expect(brief.mode).toBe('live')
    expect(brief.headline).toBe('Shanghai needs review now.')
    expect(brief.summary).toContain('86/100 PortWatch risk')
    expect(brief.why).toContain('Port calls are above baseline.')
    expect(brief.actions[0]).toMatchObject({
      label: 'Inspect affected port',
      priority: 'urgent',
      target: 'ports',
    })
  })

  it('adds a monitor action when the selected risk forecast is rising', () => {
    const brief = buildDecisionBrief({
      topPort: { ...basePort, severity: 'medium', score: 61 },
      topPortDetail: 'Container activity is elevated.',
      hasLiveRiskRows: true,
      highAnomalies: 0,
      staleSources: 0,
      propagationLinks: 0,
      riskForecastDirection: { delta: 7.4, label: 'rising' },
      topStoryNarrative: null,
    })

    expect(brief.actions).toContainEqual({
      label: 'Monitor forecast direction',
      detail: 'Risk forecast is rising by 7.4 points; use forecast cards to explain uncertainty.',
      priority: 'monitor',
      target: 'analytics',
    })
  })

  it('adds a refresh action when sources are stale', () => {
    const brief = buildDecisionBrief({
      topPort: { ...basePort, severity: 'low', score: 28 },
      topPortDetail: 'No severe watchpoint active.',
      hasLiveRiskRows: true,
      highAnomalies: 0,
      staleSources: 2,
      propagationLinks: 0,
      riskForecastDirection: null,
      topStoryNarrative: null,
    })

    expect(brief.actions).toContainEqual({
      label: 'Refresh stale source data',
      detail: '2 sources are stale; refresh before treating stories as current.',
      priority: 'watch',
    })
  })

  it('returns an unavailable brief and force fetch action when live risk rows are absent', () => {
    const brief = buildDecisionBrief({
      topPort: undefined,
      topPortDetail: 'No active PortWatch risk row',
      hasLiveRiskRows: false,
      highAnomalies: 0,
      staleSources: 0,
      propagationLinks: 0,
      riskForecastDirection: null,
      topStoryNarrative: null,
    })

    expect(brief.mode).toBe('empty')
    expect(brief.headline).toBe('Decision brief unavailable')
    expect(brief.actions).toEqual([
      {
        label: 'Run Force Fetch',
        detail: 'Populate PortWatch risk rows, source freshness, stories, and forecasts before presenting the demo.',
        priority: 'urgent',
      },
    ])
  })

  it('orders actions by priority and limits the list to three', () => {
    const brief = buildDecisionBrief({
      topPort: basePort,
      topPortDetail: 'Port calls are above baseline.',
      hasLiveRiskRows: true,
      highAnomalies: 4,
      staleSources: 2,
      propagationLinks: 3,
      riskForecastDirection: { delta: 5.2, label: 'rising' },
      topStoryNarrative: 'Latest story explains the pressure.',
    })

    expect(brief.actions).toHaveLength(3)
    expect(brief.actions.map(action => action.priority)).toEqual(['urgent', 'watch', 'watch'])
    expect(brief.actions.map(action => action.label)).toEqual([
      'Inspect affected port',
      'Refresh stale source data',
      'Review downstream propagation',
    ])
  })
})
