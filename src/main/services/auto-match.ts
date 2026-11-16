import { diceCoefficient, matchScore } from '@shared/utils'

export const AUTO_MATCH_MIN_SCORE = 0.82
export const AUTO_MATCH_MIN_TITLE = 0.88
export const AUTO_MATCH_MIN_ARTIST = 0.5
export const AUTO_MATCH_MAX_DURATION_DELTA = 5
const AUTO_MATCH_AMBIGUITY_GAP = 0.05

export interface AutoMatchInput {
  title: string
  artist: string
  durationSec?: number
}

export interface AutoMatchCandidate {
  songId: number
  title: string
  artist: string
  durationSec?: number
  score?: number
}

export function selectAutoMatchCandidate<T extends AutoMatchCandidate>(
  input: AutoMatchInput,
  candidates: T[]
): (T & { score: number }) | undefined {
  const ranked = candidates
    .filter(candidate => candidate.songId > 0)
    .map(candidate => {
      const titleScore = diceCoefficient(input.title, candidate.title)
      const artistScore = diceCoefficient(input.artist, candidate.artist)
      const durationDelta =
        input.durationSec && candidate.durationSec
          ? Math.abs(input.durationSec - candidate.durationSec)
          : 0
      return {
        ...candidate,
        titleScore,
        artistScore,
        durationDelta,
        score: matchScore(input, candidate)
      }
    })
    .filter(
      candidate =>
        candidate.score >= AUTO_MATCH_MIN_SCORE &&
        candidate.titleScore >= AUTO_MATCH_MIN_TITLE &&
        candidate.artistScore >= AUTO_MATCH_MIN_ARTIST &&
        candidate.durationDelta <= AUTO_MATCH_MAX_DURATION_DELTA
    )
    .sort((a, b) => b.score - a.score)

  const best = ranked[0]
  if (!best) return undefined
  const second = ranked[1]
  if (second && best.score - second.score < AUTO_MATCH_AMBIGUITY_GAP) {
    return undefined
  }
  return best
}
