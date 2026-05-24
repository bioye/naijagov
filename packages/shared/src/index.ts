/**
 * @naijagov/shared
 * Canonical types shared between the API and web app.
 * Zero runtime dependencies — pure TypeScript.
 */

// ── Geographic ────────────────────────────────────────────────

export interface State {
  id: number
  inecCode: number
  alphaCode: string
  name: string
  slug: string
  geopoliticalZone: string
}

export interface LGA {
  id: number
  stateId: number
  inecCode: number
  name: string
  slug: string
}

export interface Ward {
  id: number
  lgaId: number
  stateId: number
  inecCode: number
  compoundCode: string
  name: string
  slug: string
}

export interface PollingUnit {
  id: number
  wardId: number
  puLocId: string
  inecPuCode: number
  description: string | null
  hasGps: boolean
  lat: number | null
  lng: number | null
}

export interface SenatorialDistrict {
  id: number
  stateId: number
  inecCode: string
  name: string
  slug: string
}

export interface FederalConstituency {
  id: number
  stateId: number
  inecCode: string
  name: string
  slug: string
}

export interface StateConstituency {
  id: number
  stateId: number
  inecCode: string
  name: string
  slug: string
}

export interface PoliticalStack {
  state: State
  lga: LGA
  ward: Ward
  pollingUnit: PollingUnit | null
  constituencies: {
    stateConstituency: StateConstituency | null
    federalConstituency: FederalConstituency | null
    senatorialDistrict: SenatorialDistrict | null
  }
  dataQuality: {
    scMissing: boolean
    fcMissing: boolean
    sdMissing: boolean
    hasGps: boolean
  }
}

// ── Representatives ───────────────────────────────────────────

export type RepRole =
  | 'president'
  | 'vice_president'
  | 'governor'
  | 'deputy_governor'
  | 'senator'
  | 'house_of_reps'
  | 'state_assembly'
  | 'lga_chairman'
  | 'councillor'

export type RepStatus = 'incumbent' | 'former' | 'deceased'

export interface Party {
  id: number
  name: string
  abbreviation: string
  slug: string
  logoUrl: string | null
  colorHex: string | null
}

export interface Representative {
  id: string
  slug: string
  fullName: string
  role: RepRole
  status: RepStatus
  party: Party | null
  state: Pick<State, 'id' | 'name' | 'slug'> | null
  constituency: {
    type: 'senatorial' | 'federal' | 'state' | 'lga' | 'ward' | null
    name: string | null
    slug: string | null
  }
  photoUrl: string | null
  bio: string | null
  termStart: string | null   // ISO date
  termEnd: string | null
  contact: {
    email: string | null
    phone: string | null
    officeAddress: string | null
    website: string | null
    twitterHandle: string | null
    facebookUrl: string | null
  }
  dataVerified: boolean
}

export interface RepSummary {
  id: string
  slug: string
  fullName: string
  role: RepRole
  status: RepStatus
  partyAbbreviation: string | null
  partyColorHex: string | null
  photoUrl: string | null
  constituencyName: string | null
  stateName: string | null
}

// ── Elections ─────────────────────────────────────────────────

export type ElectionType =
  | 'presidential'
  | 'gubernatorial'
  | 'senatorial'
  | 'house_of_reps'
  | 'state_assembly'
  | 'lga_chairmanship'
  | 'councillorship'

export type ElectionStatus =
  | 'upcoming'
  | 'campaigns_open'
  | 'voting_day'
  | 'collating'
  | 'declared'
  | 'disputed'

export interface ElectionCycle {
  id: number
  year: number
  electionDate: string   // ISO date
  status: ElectionStatus
  notes: string | null
  daysRemaining: number | null  // null if past
}

export interface ManifestoSummary {
  economy: string | null
  security: string | null
  education: string | null
  health: string | null
  infrastructure: string | null
  generatedAt: string | null
}

export interface Candidate {
  id: string
  slug: string
  fullName: string
  party: Party
  raceId: number
  electionType: ElectionType
  constituencyName: string | null
  stateOfOrigin: Pick<State, 'id' | 'name'> | null
  photoUrl: string | null
  bio: string | null
  education: string | null
  occupation: string | null
  manifestoUrl: string | null
  manifestoSummary: ManifestoSummary | null
  website: string | null
  twitterHandle: string | null
  status: 'declared' | 'nominated' | 'ballot_confirmed' | 'withdrew' | 'disqualified'
  isIncumbent: boolean
}

export interface ElectionResult {
  candidateId: string
  candidateName: string
  partyAbbreviation: string
  partyColorHex: string | null
  votes: number
  percentage: number
  isWinner: boolean
}

// ── Feed / Town Square ────────────────────────────────────────

export type PostTopic =
  | 'infrastructure' | 'health'    | 'security'
  | 'education'      | 'water'     | 'electricity'
  | 'corruption'     | 'elections' | 'youth'
  | 'women'          | 'economy'   | 'other'

export interface Post {
  id: string
  author: {
    id: string
    displayName: string
    verificationTier: 'phone_verified' | 'nin_verified'
    wardName: string | null
    lgaName: string | null
  }
  body: string
  topic: PostTopic
  scope: {
    wardId: number | null
    lgaId: number | null
    stateId: number | null
    wardName: string | null
    lgaName: string | null
    stateName: string | null
  }
  upvoteCount: number
  replyCount: number
  userHasUpvoted: boolean
  createdAt: string
}

// ── Auth ──────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  phone: string
  displayName: string | null
  verificationTier: 'phone_verified' | 'nin_verified'
  wardId: number | null
  isAdmin: boolean
}

// ── API Response envelope ─────────────────────────────────────

export interface ApiSuccess<T> {
  ok: true
  data: T
}

export interface ApiError {
  ok: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

// ── Pagination ────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}
