/**
 * SAMVAD — Production-Grade Personalized Scheme Recommendation Engine (v3)
 * =========================================================================
 *
 * KEY CHANGE from v2: Interest is now a MULTIPLICATIVE GATE, not an additive weight.
 * Zero interest match → entire score capped at ≤20%.
 * This eliminates the static 40-50% scores for mismatched schemes.
 *
 * Pipeline:
 *   STAGE 1 — STRICT PRE-FILTERS (eliminatory)
 *     ① Active date  ② Gender gate  ③ Occupation match  ④ Area match
 *
 *   STAGE 2 — MULTIPLICATIVE INTEREST-GATED SCORING
 *     baseScore = priority(0.35) + age(0.30) + genderFit(0.20) + benefitQuality(0.15)
 *     interestMultiplier = f(interestScore)   // 1.0 exact → 0.20 no-match
 *     finalScore = (0.55 * interestScore + 0.45 * baseScore) * interestMultiplier
 *
 *   STAGE 3 — DIVERSITY CONTROL
 *     Name-family dedup + cluster dedup + benefit-type variety
 *
 * All output is deterministic. No randomness. No fallback to irrelevant schemes.
 */

const Scheme = require('../models/Scheme');

// ─── Interest Group Relations ──────────────────────────────────────
// Expanded with cross-domain links so fewer voters get zero matches
const INTEREST_RELATIONS = {
  technology: ['coding', 'tech', 'digital', 'startup', 'it', 'software', 'computer', 'education'],
  agriculture: ['farming', 'irrigation', 'crops', 'nature', 'rural', 'horticulture'],
  health:      ['healthcare', 'medical', 'wellness', 'nutrition', 'sanitation', 'walking', 'sports', 'fitness', 'exercise'],
  finance:     ['banking', 'loan', 'insurance', 'pension', 'savings', 'investment'],
  education:   ['learning', 'study', 'school', 'college', 'university', 'skill', 'technology', 'coding'],
  community:   ['social', 'community service', 'ngo', 'welfare', 'family', 'lifestyle', 'travel'],
  arts:        ['crafts', 'culture', 'music', 'painting', 'literature', 'creative'],
  sports:      ['fitness', 'games', 'athletics', 'physical', 'exercise', 'health', 'wellness'],
  travel:      ['tourism', 'transport', 'mobility', 'community'],
  lifestyle:   ['fashion', 'living', 'home', 'community', 'arts'],
};

// Women-only keywords
const WOMEN_KEYWORDS = ['women', 'girl', 'female', 'mahila', 'beti', 'sukanya', 'stree'];

// Age affinity rules per benefit_type and target_interest
const AGE_AFFINITY = {
  training:           { minAge: 18, maxAge: 40, peak: 25 },
  education:          { minAge: 18, maxAge: 35, peak: 22 },
  technology:         { minAge: 18, maxAge: 45, peak: 28 },
  'job opportunities': { minAge: 18, maxAge: 40, peak: 28 },
  pension:            { minAge: 55, maxAge: 100, peak: 65 },
  healthcare:         { minAge: 50, maxAge: 100, peak: 70 },
  health:             { minAge: 30, maxAge: 100, peak: 60 },
  subsidy:            { minAge: 25, maxAge: 70, peak: 45 },
  loan:               { minAge: 22, maxAge: 60, peak: 35 },
  support:            { minAge: 18, maxAge: 100, peak: 50 },
  agriculture:        { minAge: 22, maxAge: 70, peak: 40 },
  finance:            { minAge: 25, maxAge: 80, peak: 45 },
  community:          { minAge: 18, maxAge: 100, peak: 40 },
  arts:               { minAge: 18, maxAge: 50, peak: 25 },
};

// ─── Income Bracket Ordinals (for comparison) ──────────────────────
const INCOME_BRACKET_ORDER = {
  'below_1_5': 0,
  '1_5_to_3':  1,
  '3_to_6':    2,
  '6_to_10':   3,
  'above_10':  4,
};


// ─── PersonalizedRecommender ───────────────────────────────────────

class PersonalizedRecommender {
  constructor() {
    this.schemes = [];
    this.isBuilt = false;
    this._maxPriority = 10;
  }

  // ─── Build / Index ──────────────────────────────────────────

  async build() {
    console.log('[Recommender v3] Building scheme index...');
    const raw = await Scheme.find({}).lean();

    if (raw.length > 0) {
      this._maxPriority = Math.max(...raw.map(s => s.priority_score || 0), 1);
    }

    this.schemes = raw.map(scheme => ({
      ...scheme,
      _isWomenScheme:        this._detectWomenScheme(scheme),
      _isActive:             this._isSchemeActive(scheme),
      _normalizedInterest:   (scheme.target_interest || '').toLowerCase().trim(),
      _normalizedOccupation: (scheme.target_occupation || '').toLowerCase().trim(),
      _normalizedArea:       (scheme.area_type || 'All').trim(),
      _normalizedBenefit:    (scheme.benefit_type || '').toLowerCase().trim(),
      _clusterKey:           this._computeClusterKey(scheme),
      _schemeFamily:         this._computeSchemeFamily(scheme),
    }));

    const active = this.schemes.filter(s => s._isActive).length;
    console.log(`[Recommender v3] Index ready: ${this.schemes.length} schemes (${active} active).`);
    this.isBuilt = true;
  }

  async ensureBuilt() {
    if (!this.isBuilt) await this.build();
  }

  // ─── Pre-annotation Helpers ─────────────────────────────────

  _detectWomenScheme(scheme) {
    const eligibilityRaw = scheme.eligibility || '';
    const eligibility = (typeof eligibilityRaw === 'string' ? eligibilityRaw : JSON.stringify(eligibilityRaw)).toLowerCase();
    const name = (scheme.scheme_name || '').toLowerCase();
    return WOMEN_KEYWORDS.some(kw => eligibility.includes(kw) || name.includes(kw))
      || eligibility.startsWith('for women');
  }

  _isSchemeActive(scheme) {
    const now = new Date();
    const startOk = !scheme.start_date || new Date(scheme.start_date) <= now;
    const endOk   = !scheme.end_date   || new Date(scheme.end_date)   >= now;
    return startOk && endOk;
  }

  /**
   * Cluster key: groups near-identical schemes by content signature.
   * occupation + interest + benefitType + first 40 chars of description
   */
  _computeClusterKey(scheme) {
    const occ  = (scheme.target_occupation || '').toLowerCase().trim();
    const int  = (scheme.target_interest || '').toLowerCase().trim();
    const ben  = (scheme.benefit_type || '').toLowerCase().trim();
    const desc = (scheme.description || '').toLowerCase().trim().slice(0, 40);
    return `${occ}|${int}|${ben}|${desc}`;
  }

  /**
   * Scheme family: extracts the base name pattern by stripping numbers.
   * "Crafts Initiative 107" → "crafts initiative"
   * "NHM" → "nhm"
   * Used to prevent multiple variants of the same named scheme in top-N.
   */
  _computeSchemeFamily(scheme) {
    return (scheme.scheme_name || '')
      .replace(/\d+/g, '')     // strip all numbers
      .replace(/\s+/g, ' ')    // normalize whitespace
      .trim()
      .toLowerCase();
  }

  // ─── Stage 1: Strict Pre-Filters ───────────────────────────

  _passesPreFilters(scheme, voterOcc, voterArea, voterGender, eligibility = {}) {
    // FILTER 0: Government Employee — no schemes target this category
    if (voterOcc === 'government employee') return false;

    // FILTER 1: Must be active
    if (!scheme._isActive) return false;

    // FILTER 2: Gender gate — women-only schemes ONLY for Female
    if (scheme._isWomenScheme && voterGender !== 'Female') return false;

    // FILTER 3: Occupation match — MANDATORY exact match
    const schemeOcc = scheme._normalizedOccupation;
    if (schemeOcc && voterOcc && schemeOcc !== voterOcc) return false;

    // FILTER 4: Area match — MANDATORY (exact or "All"/"Both")
    const schemeArea = scheme._normalizedArea;
    if (schemeArea && schemeArea !== 'All' && schemeArea !== 'Both') {
      if (schemeArea !== voterArea) return false;
    }

    // ── STAGE 0: ELIGIBILITY PRE-FILTER ──
    const elig = scheme.eligibility || {};

    // FILTER 5: BPL requirement
    if (elig.requiresBpl === true && eligibility.bplStatus !== true) return false;

    // FILTER 6: SC/ST requirement
    if (elig.requiresScst === true && eligibility.scstStatus !== true) return false;

    // FILTER 7: PwD requirement
    if (elig.requiresPwd === true && eligibility.pwdStatus !== true) return false;

    // FILTER 8: Income bracket cap
    if (elig.maxIncomeBracket && eligibility.incomeRange) {
      const schemeMax = INCOME_BRACKET_ORDER[elig.maxIncomeBracket];
      const userIncome = INCOME_BRACKET_ORDER[eligibility.incomeRange];
      if (schemeMax !== undefined && userIncome !== undefined && userIncome > schemeMax) {
        return false;
      }
    }

    return true;
  }

  // ─── Stage 2: Scoring Components ────────────────────────────

  /**
   * Interest alignment — THE primary decision factor.
   * Returns: { score: 0-1, level: 'exact'|'related'|'weak'|'none' }
   */
  _scoreInterest(scheme, voterInterests) {
    const schemeInterest = scheme._normalizedInterest;

    // Scheme has no target interest → mildly applicable
    if (!schemeInterest) return { score: 0.25, level: 'generic' };

    const interests = (voterInterests || []).map(i => i.toLowerCase().trim());

    // Voter has no interest data → conservative
    if (interests.length === 0) return { score: 0.10, level: 'no-data' };

    // EXACT match — strongest signal
    if (interests.includes(schemeInterest)) return { score: 1.0, level: 'exact' };

    // RELATED group match — check bidirectionally
    for (const [group, related] of Object.entries(INTEREST_RELATIONS)) {
      const groupAll = [group, ...related];
      if (groupAll.includes(schemeInterest)) {
        if (interests.some(vi => groupAll.includes(vi))) {
          return { score: 0.45, level: 'related' };
        }
      }
    }

    // NO match at all
    return { score: 0.0, level: 'none' };
  }

  /**
   * Age relevance score (0-1).
   */
  _scoreAge(scheme, voterAge) {
    if (!voterAge || voterAge <= 0) return 0.5;

    const affinityRule = AGE_AFFINITY[scheme._normalizedBenefit]
                      || AGE_AFFINITY[scheme._normalizedInterest];
    if (!affinityRule) return 0.5;

    const { minAge, maxAge, peak } = affinityRule;

    if (voterAge < minAge - 5 || voterAge > maxAge + 5) return 0.1;

    if (voterAge >= minAge && voterAge <= maxAge) {
      const distance = Math.abs(voterAge - peak);
      const maxDistance = Math.max(peak - minAge, maxAge - peak, 1);
      return 1.0 - (distance / maxDistance) * 0.4; // range: 0.60–1.00
    }

    return 0.25;
  }

  /**
   * Normalized priority (0-1).
   */
  _scorePriority(scheme) {
    return Math.min((scheme.priority_score || 0) / this._maxPriority, 1.0);
  }

  /**
   * Gender-fit bonus (0-1). Only a scoring signal; the hard gate is in Stage 1.
   */
  _scoreGenderFit(scheme, voterGender) {
    if (scheme._isWomenScheme && voterGender === 'Female') return 1.0;
    return 0.5;
  }

  /**
   * Benefit quality signal — prefers concrete benefit types.
   */
  _scoreBenefitQuality(scheme) {
    const b = scheme._normalizedBenefit;
    if (['loan', 'subsidy', 'healthcare', 'pension'].includes(b)) return 1.0;
    if (['training', 'job opportunities'].includes(b)) return 0.8;
    if (b === 'support') return 0.4;
    return 0.5;
  }

  // ─── Stage 2: Composite Score ───────────────────────────────

  /**
   * Compute the final relevance score using MULTIPLICATIVE INTEREST GATING.
   *
   * The interest multiplier ensures that scores for non-matching schemes
   * are hard-capped at low percentages, creating real differentiation.
   */
  _computeScore(interestResult, ageScore, priorityScore, genderFitScore, benefitScore) {
    // Base score from non-interest factors
    const baseScore =
      0.35 * priorityScore +
      0.30 * ageScore +
      0.20 * genderFitScore +
      0.15 * benefitScore;

    // Interest multiplier — the key innovation
    let interestMultiplier;
    switch (interestResult.level) {
      case 'exact':    interestMultiplier = 1.0;  break;  // full score
      case 'related':  interestMultiplier = 0.65; break;  // moderate reduction
      case 'generic':  interestMultiplier = 0.45; break;  // scheme has no specific interest
      case 'weak':     interestMultiplier = 0.30; break;  // voter has weak data
      case 'no-data':  interestMultiplier = 0.25; break;  // voter has no interest data
      case 'none':     interestMultiplier = 0.20; break;  // ZERO match → hard cap
      default:         interestMultiplier = 0.20; break;
    }

    // Composite: blend interest score with base, then gate by multiplier
    const rawScore = 0.55 * interestResult.score + 0.45 * baseScore;
    const finalScore = rawScore * interestMultiplier;

    return { finalScore, interestMultiplier, baseScore, rawScore };
  }

  // ─── Stage 3: Diversity Control ─────────────────────────────

  /**
   * Pick top-N diverse schemes from ranked candidates.
   * De-duplicates by BOTH cluster key AND scheme family name.
   * Prefers varied benefit_types across the final set.
   */
  _applyDiversityControl(rankedCandidates, topN) {
    const selected = [];
    const usedClusters = new Set();
    const usedFamilies = new Set();
    const usedBenefitTypes = new Set();

    // Pass 1: Pick highest-scoring from each unique family + cluster
    for (const c of rankedCandidates) {
      if (selected.length >= topN) break;
      if (usedClusters.has(c._clusterKey)) continue;
      if (usedFamilies.has(c._schemeFamily)) continue;

      usedClusters.add(c._clusterKey);
      usedFamilies.add(c._schemeFamily);
      usedBenefitTypes.add(c.benefit_type);
      selected.push(c);
    }

    // Pass 2: Fill remaining with different benefit types
    if (selected.length < topN) {
      for (const c of rankedCandidates) {
        if (selected.length >= topN) break;
        if (usedClusters.has(c._clusterKey) || usedFamilies.has(c._schemeFamily)) continue;
        if (!usedBenefitTypes.has(c.benefit_type)) {
          usedClusters.add(c._clusterKey);
          usedFamilies.add(c._schemeFamily);
          usedBenefitTypes.add(c.benefit_type);
          selected.push(c);
        }
      }
    }

    // Pass 3: Final fill with any remaining unique schemes
    if (selected.length < topN) {
      for (const c of rankedCandidates) {
        if (selected.length >= topN) break;
        if (usedClusters.has(c._clusterKey) || usedFamilies.has(c._schemeFamily)) continue;
        usedClusters.add(c._clusterKey);
        usedFamilies.add(c._schemeFamily);
        selected.push(c);
      }
    }

    return selected;
  }

  // ─── Main Recommend ─────────────────────────────────────────

  async recommend(voterProfile, options = { topN: 3 }) {
    await this.ensureBuilt();

    const { occupation, interests, area_type, gender, age,
            incomeRange, pwdStatus, bplStatus, scstStatus } = voterProfile;

    const voterOcc    = (occupation || '').toLowerCase().trim();
    const voterArea   = (area_type || '').trim();
    const voterGender = (gender || '').trim();
    const eligibility = { incomeRange, pwdStatus, bplStatus, scstStatus };

    const candidates = [];

    for (const scheme of this.schemes) {
      // ── STAGE 0 + STAGE 1: ELIGIBILITY + STRICT PRE-FILTERS ──
      if (!this._passesPreFilters(scheme, voterOcc, voterArea, voterGender, eligibility)) continue;

      // ── STAGE 2: MULTIPLICATIVE INTEREST-GATED SCORING ──
      const interestResult = this._scoreInterest(scheme, interests);
      const ageScore       = this._scoreAge(scheme, age);
      const priScore       = this._scorePriority(scheme);
      const genScore       = this._scoreGenderFit(scheme, voterGender);
      const benScore       = this._scoreBenefitQuality(scheme);

      const { finalScore, interestMultiplier, baseScore } =
        this._computeScore(interestResult, ageScore, priScore, genScore, benScore);

      // Scale to 0–100 percentage
      const relevancePercent = Math.round(finalScore * 100);

      // ── BUILD MATCH EXPLANATION ──
      const reasons = [];
      reasons.push(`Occupation: ${occupation || 'N/A'} ✓`);
      reasons.push(`Area: ${area_type || 'N/A'} ✓`);

      // Interest detail
      if (interestResult.level === 'exact') {
        reasons.push(`Interest: ${(interests || []).join(', ')} ✓ (exact match)`);
      } else if (interestResult.level === 'related') {
        reasons.push(`Interest: related to ${scheme.target_interest} (~)`);
      } else if (interestResult.level === 'generic') {
        reasons.push(`Interest: scheme is general-purpose`);
      } else if (interestResult.level === 'none') {
        reasons.push(`Interest: no match ✗ (score capped)`);
      } else {
        reasons.push(`Interest: limited data`);
      }

      // Gender
      if (scheme._isWomenScheme && voterGender === 'Female') {
        reasons.push(`Gender: Women-focused ✓`);
      } else {
        reasons.push(`Gender: eligible ✓`);
      }

      // Eligibility
      const elig = scheme.eligibility || {};
      if (elig.requiresBpl && bplStatus) reasons.push('BPL: eligible ✓');
      if (elig.requiresScst && scstStatus) reasons.push('SC/ST: eligible ✓');
      if (elig.requiresPwd && pwdStatus) reasons.push('PwD: eligible ✓');
      if (elig.maxIncomeBracket && incomeRange) reasons.push(`Income: within cap ✓`);

      // Age
      if (ageScore >= 0.8) reasons.push(`Age: ${age}y — ideal range ✓`);
      else if (ageScore >= 0.5) reasons.push(`Age: ${age}y — suitable`);
      else if (ageScore > 0.2) reasons.push(`Age: ${age}y — partial fit`);

      candidates.push({
        scheme_id:       scheme.scheme_id,
        scheme_name:     scheme.scheme_name,
        name:            scheme.scheme_name,
        description:     scheme.description,
        category:        scheme.target_occupation,
        target_interest: scheme.target_interest,
        area_type:       scheme.area_type,
        benefit_type:    scheme.benefit_type,
        eligibility:     scheme.eligibility,
        priority_score:  scheme.priority_score,
        relevanceScore:  relevancePercent,
        score:           relevancePercent,
        matchReasons:    reasons,
        _clusterKey:     scheme._clusterKey,
        _schemeFamily:   scheme._schemeFamily,
        _breakdown: {
          interestScore:      +(interestResult.score.toFixed(3)),
          interestLevel:       interestResult.level,
          interestMultiplier: +(interestMultiplier.toFixed(2)),
          ageScore:           +(ageScore.toFixed(3)),
          priorityScore:      +(priScore.toFixed(3)),
          genderFitScore:     +(genScore.toFixed(3)),
          benefitScore:       +(benScore.toFixed(3)),
          baseScore:          +(baseScore.toFixed(4)),
          finalScore:         +(finalScore.toFixed(4)),
        },
      });
    }

    // Deterministic sort: score desc → priority desc → scheme_id asc
    candidates.sort((a, b) => {
      if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
      if ((b.priority_score || 0) !== (a.priority_score || 0)) return (b.priority_score || 0) - (a.priority_score || 0);
      return (a.scheme_id || '').localeCompare(b.scheme_id || '');
    });

    // ── STAGE 3: DIVERSITY CONTROL ──
    const diverse = this._applyDiversityControl(candidates, options.topN);

    // Clean internal keys before returning
    return diverse.map(({ _clusterKey, _schemeFamily, ...rest }) => rest);
  }
}


// ─── Singleton + Backward-Compatible Exports ───────────────────────

const recommender = new PersonalizedRecommender();

/**
 * Top-level entry point — same signature as v1/v2 for backward compatibility.
 */
const getRecommendedSchemes = async (
  mlScores,
  boothIssue = '',
  gender = 'Other',
  age = 0,
  interests = [],
  occupation = '',
  areaType = 'Rural',
  topN = 3,
  incomeRange = null,
  pwdStatus = false,
  bplStatus = false,
  scstStatus = false
) => {
  // Derive occupation from ML scores if voter has no direct occupation
  let derivedOccupation = occupation;
  if (!derivedOccupation && mlScores) {
    const categories = Object.keys(mlScores).filter(k => typeof mlScores[k] === 'number');
    if (categories.length > 0) {
      derivedOccupation = categories.reduce((a, b) => mlScores[a] > mlScores[b] ? a : b);
    }
  }

  return recommender.recommend(
    {
      occupation: derivedOccupation,
      interests,
      area_type: areaType,
      gender,
      age,
      mlScores,
      incomeRange,
      pwdStatus,
      bplStatus,
      scstStatus
    },
    { topN }
  );
};

const rebuildGraph = async () => {
  recommender.isBuilt = false;
  await recommender.build();
};

module.exports = {
  knowledgeGraph: recommender,
  getRecommendedSchemes,
  rebuildGraph,
};
