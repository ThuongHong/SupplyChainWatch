import type { RiskScoreResponse } from '../api/client'
import type { DataMode } from '../api/viewModels'

export type DecisionPriority = 'urgent' | 'watch' | 'monitor'
export type DecisionTarget = 'ports' | 'analytics' | 'vessels'

export type DecisionAction = {
  label: string
  detail: string
  priority: DecisionPriority
  target?: DecisionTarget
}

export type DecisionBrief = {
  headline: string
  summary: string
  why: string[]
  actions: DecisionAction[]
  mode: DataMode
}

export type RiskForecastDirection = {
  delta: number
  label: string
}

export type DecisionBriefInput = {
  topPort?: RiskScoreResponse
  topPortDetail: string
  hasLiveRiskRows: boolean
  highAnomalies: number
  staleSources: number
  propagationLinks: number
  riskForecastDirection: RiskForecastDirection | null
  topStoryNarrative: string | null
}

const priorityRank: Record<DecisionPriority, number> = {
  urgent: 0,
  watch: 1,
  monitor: 2,
}

const plural = (count: number, singular: string, pluralText = `${singular}s`) =>
  `${count} ${count === 1 ? singular : pluralText}`

export function buildDecisionBrief(input: DecisionBriefInput): DecisionBrief {
  if (!input.hasLiveRiskRows || !input.topPort) {
    return {
      headline: 'Decision brief unavailable',
      summary: 'Live PortWatch risk rows are required before the dashboard can explain what matters next.',
      why: ['No ranked PortWatch risk row is available yet.'],
      actions: [
        {
          label: 'Run Force Fetch',
          detail: 'Populate PortWatch risk rows, source freshness, stories, and forecasts before presenting the demo.',
          priority: 'urgent',
        },
      ],
      mode: 'empty',
    }
  }

  const actions: DecisionAction[] = []
  const why = [input.topPortDetail]
  const score = Math.round(input.topPort.score)
  const isActiveWatchpoint = input.topPort.severity === 'high' || input.topPort.severity === 'medium'

  if (isActiveWatchpoint) {
    actions.push({
      label: 'Inspect affected port',
      detail: `${input.topPort.entity_name} is ${input.topPort.severity} at ${score}/100; open the port view for detail and evidence.`,
      priority: 'urgent',
      target: 'ports',
    })
  }

  if (input.staleSources > 0) {
    why.push(`${plural(input.staleSources, 'source')} stale.`)
    actions.push({
      label: 'Refresh stale source data',
      detail: `${plural(input.staleSources, 'source')} are stale; refresh before treating stories as current.`,
      priority: 'watch',
    })
  }

  if (input.propagationLinks > 0) {
    why.push(`${plural(input.propagationLinks, 'propagation link')} active.`)
    actions.push({
      label: 'Review downstream propagation',
      detail: `${plural(input.propagationLinks, 'modeled downstream link')} may explain where pressure spreads next.`,
      priority: 'watch',
      target: 'analytics',
    })
  }

  if (input.riskForecastDirection?.label === 'rising' && input.riskForecastDirection.delta > 0) {
    const delta = input.riskForecastDirection.delta.toFixed(1)
    why.push(`Forecast risk is rising by ${delta} points.`)
    actions.push({
      label: 'Monitor forecast direction',
      detail: `Risk forecast is rising by ${delta} points; use forecast cards to explain uncertainty.`,
      priority: 'monitor',
      target: 'analytics',
    })
  }

  if (input.highAnomalies > 0) {
    why.push(`${plural(input.highAnomalies, 'high-severity anomaly', 'high-severity anomalies')} in the current window.`)
    actions.push({
      label: 'Review anomaly evidence',
      detail: `${plural(input.highAnomalies, 'high-severity anomaly', 'high-severity anomalies')} need evidence review in the analysis page.`,
      priority: input.highAnomalies >= 5 ? 'urgent' : 'watch',
      target: 'analytics',
    })
  }

  if (input.topStoryNarrative) {
    why.push(input.topStoryNarrative)
  }

  const orderedActions = actions
    .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority])
    .slice(0, 3)

  return {
    headline: isActiveWatchpoint
      ? `${input.topPort.entity_name} needs review now.`
      : 'Global network is within monitored thresholds.',
    summary: isActiveWatchpoint
      ? `${input.topPort.entity_name} leads with ${score}/100 PortWatch risk. Use the next actions to move from signal to evidence.`
      : `${input.topPort.entity_name} is the highest ranked port at ${score}/100, with no high or medium active watchpoint.`,
    why: why.slice(0, 3),
    actions: orderedActions.length > 0 ? orderedActions : [
      {
        label: 'Continue monitoring',
        detail: 'No urgent follow-up is active; keep source freshness and forecast direction under review.',
        priority: 'monitor',
      },
    ],
    mode: 'live',
  }
}
