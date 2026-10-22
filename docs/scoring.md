# likelylikes — scoring

Status: design (mathematics only). Resolves *Core model → Scoring* and the
open questions on the LLR formulation and unseen pairs in
[requirements.md](requirements.md); proposes a consistency score (§5).

## Summary

- A pick scores $s = \log_2(4p)$ **bits**, where $p$ is the probability the
  player's own model gave the picked image *before* the pick.
- That is the log₂ likelihood ratio of the pick between "this player is
  predictable" and "this player clicks at random" ($p = ¼$).
- **At most 2 bits per pick.** A choice of one image from four cannot carry
  more than $\log_2 4 = 2$ bits; any valid evidence measure against random
  clicking is capped there. A pick the model rated at chance scores 0; a pick
  that surprised it scores below 0.
- The cumulative LLR is the log₂ of the **product** of the per-pick likelihood
  ratios: the exact likelihood ratio of the player's whole record against
  random clicking. A random clicker ever reaches $b$ bits with probability at
  most $2^{-b}$.
- $p$ comes from a fixed mixture of a few forecasters (§4). Each is built on
  Bradley–Terry strengths fitted to the pairwise win counts, combined by
  Luce's choice rule, with a Beta prior and a misclick floor.

## 1. Setting

| Symbol | Meaning |
|---|---|
| $N$ | images in the set |
| $Q_t$ | the quad shown in round $t$; $k = \lvert Q_t\rvert = 4$ |
| $x_t \in Q_t$ | the image picked |
| $H_{t-1}$ | all earlier rounds $(Q_1,x_1),\dots,(Q_{t-1},x_{t-1})$ for this player × set |
| $n_{ij}$ | pairwise win counts: rounds in which $i$ was picked while $j$ was shown |
| $p_t$ | the **forecast**: a distribution over $Q_t$, computed from $H_{t-1}$ and $Q_t$ before the pick |

A pick of $x$ from $Q$ adds 1 to $n_{xj}$ for each of the three $j \in Q\setminus\{x\}$.
(The requirements call $n$ a confusion matrix. It is a paired-comparison win
matrix, and §4.2 explains why it is not the whole record.)

The forecast is produced by a **predictor**, the pluggable part (§4). The
score is fixed, and §3 holds for every predictor that meets the contract in
§4.1.

## 2. The score

The reference hypothesis $H_0$ is a player who clicks at random:
$P_0(x_t = i) = 1/k$ for every $i \in Q_t$.

$$
s_t \;=\; \log_2 \frac{p_t(x_t)}{1/k} \;=\; \log_2 k + \log_2 p_t(x_t)
\;=\; 2 + \log_2 p_t(x_t) \quad\text{bits}
$$

$$
S_T \;=\; \sum_{t=1}^{T} s_t \;=\; \log_2 \prod_{t=1}^{T} \frac{p_t(x_t)}{1/k}
$$

$S_T$ is the per player × set **cumulative LLR**. A session's score is its
gain $G = \sum_{t \in \text{session}} s_t$. Every quad served before the
deadline counts. Per-round points are signed and are never clamped.

The requirements' "product of log likelihood ratios" should read "product of
likelihood ratios". One likelihood ratio per pick, multiplied over picks; the
score is the log of the product, a sum of per-pick logs. A product of logs
has no evidential meaning.

| $p_t(x_t)$ | 1 | 0.9 | 0.5 | 0.25 | 0.1 | 0.01 |
|---|---|---|---|---|---|---|
| $s_t$ (bits) | 2 | 1.85 | 1 | 0 | −1.32 | −4.64 |

## 3. Properties

### 3.1 Range

$s_t$ is increasing in $p_t(x_t)$:

- $s_t = 0$ iff $p_t(x_t) = ¼$, and $s_t < 0$ iff $p_t(x_t) < ¼$;
- $s_t < \log_2 k = 2$ always. A forecast with every entry positive never puts
  probability 1 on one image, so 2 bits is the supremum, approached and never
  reached;
- if every forecast entry is at least $\varepsilon$, then $s_t \ge \log_2(k\varepsilon)$;
  otherwise there is no lower bound. §4.3 floors it.

### 3.2 Why 2 bits and not 3

A pick implies three pairwise wins. Each pairwise ratio
$\log_2\!\big(\hat p_{xj}/\tfrac12\big)$ is at most 1 bit, so adding them gives up to
3 bits. But the three wins are one event, "$x$ is the best of these four",
and under random clicking that event has probability ¼, not $(\tfrac12)^3 = ⅛$.

Write $Z = \sum_{y\in Q}\prod_{j\ne y}\hat p_{yj} \in [0,1]$. The naive sum then exceeds
the normalised score $\log_2\!\big(4\prod_{j\ne x}\hat p_{xj}/Z\big)$ by exactly $\log_2(2Z)$:

- up to +1 bit for a confident transitive model;
- 0 when every $\hat p = ½$;
- negative (it understates) for intransitive estimates.

Worse, $\mathbb{E}_0[2^{\text{naive}}] = 2Z \to 2$ once the model has learned an order,
so the naive score is not a martingale under random clicking and has no
guarantee like §3.5. Never score with pairwise sums. Pairs are fine for
*fitting* (§4.2), not for *scoring*.

### 3.3 What the cumulative score is

The quads come from a selection rule $\sigma(Q_t \mid H_{t-1})$ that uses only
the observed history and the server's own randomness. This covers uniform
selection and later adaptive "max information" selection. Under either
hypothesis, the record has probability
$\prod_t \sigma(Q_t \mid H_{t-1})\,P(x_t \mid H_{t-1}, Q_t)$. The selection
factors are the same function under both, so they cancel:

$$
\frac{P_{\text{model}}(Q_1,x_1,\dots,Q_T,x_T)}{P_0(Q_1,x_1,\dots,Q_T,x_T)}
= \prod_{t=1}^{T} \frac{p_t(x_t)}{1/k} = 2^{S_T}.
$$

So $S_T$ is the log₂ likelihood ratio of **everything observed**, "the player
picks as forecast" against "the player clicks at random". This is just the
chain rule of probability.

If $p_t$ is a Bayesian posterior predictive,
$p_t(i) = \int P(i \mid Q_t,\theta)\,\pi(\theta \mid H_{t-1})\,d\theta$, the product of forecasts
is the marginal likelihood, and $2^{S_T}$ is the **Bayes factor** of the model
against random clicking on the joint record of quads and picks. It equals the
likelihood ratio of the picks *given* the quads only when quads are chosen
without regard to past picks (e.g. uniform). For a plug-in predictor, $2^{S_T}$
is still the exact likelihood ratio of that forecasting system, which is
Dawid's prequential likelihood.

### 3.4 What a pick is worth in expectation

Let $q$ be the player's actual choice distribution on $Q_t$. Then

$$
\mathbb{E}_q[s_t] = \underbrace{\big(\log_2 k - H(q)\big)}_{\text{predictability of the pick}}
\;-\; \underbrace{D_{\mathrm{KL}}(q \,\|\, p_t)}_{\text{forecast error}} .
$$

Proof: $\sum_i q_i \log_2(k p_i) = \log_2 k + \sum_i q_i \log_2 q_i - \sum_i q_i \log_2(q_i/p_i)$.

- The first term lies in $[0,2]$. It is 2 bits for a player who would always
  pick the same image from these four, and 0 for one who picks at random. It
  is the most this quad can earn in expectation.
- The second term is non-negative and is zero only if $p_t = q$. A model that
  has not learned the player yet costs points and never adds any.
- **Random clicking never pays.** With $q$ uniform,
  $\mathbb{E}[s_t] = -D_{\mathrm{KL}}(u \,\|\, p_t) \le 0$, whatever the model has learned.
- A noisy player approaches $\log_2 k - H(q)$, their information rate. For
  example, a Luce player with log-strength sd 0.5, 1, 2, 4 averages at most
  0.11, 0.36, 0.98, 1.46 bits per pick (computed, uniform quads, $N=100$).

For a Bayesian forecast, averaged over the model's own uncertainty about
$\theta$, the identity splits further:

$$
\mathbb{E}[s_t] = \log_2 k \;-\; \underbrace{\mathbb{E}\,H(q_\theta)}_{\text{noise}} \;-\; \underbrace{I(x_t;\theta \mid H_{t-1}, Q_t)}_{\text{what this pick teaches the model}} .
$$

Points, noise and learning add up to 2 bits. A quad that teaches the model a
lot is, by the same token, worth few points (§7, selection).

### 3.5 Guarantee against random clicking

Under $H_0$,
$\mathbb{E}_0\big[2^{s_t} \mid H_{t-1}, Q_t\big] = \sum_i \tfrac1k \cdot k\,p_t(i) = 1$,
so $2^{S_T}$ is a non-negative martingale starting at 1 (a test martingale).
By Ville's inequality,

$$
P_0\big(\exists\,T:\ S_T \ge b\big) \le 2^{-b}.
$$

The bound covers the supremum over time, so it holds at the end of a
60-second session whatever the number of picks. It also holds for one
session's gain given the earlier history: $P_0(G \ge b) \le 2^{-b}$. A random
clicker reaches a 10-bit session with probability at most 1/1024. The bound
applies per player × set, for $b$ fixed in advance. It says nothing about the
best of many sessions or many anonymous IDs (§7).

**Position play is random play.** Assume the display order is a fresh uniform
permutation, drawn server-side for every presentation, and the predictor never
sees screen positions. Then any strategy that uses only positions, the
player's own timing and past rounds makes $x_t$ uniform on $Q_t$ given the
predictor's information. That is $H_0$, so §3.4 and §3.5 apply. Content-
dependent side channels break this: image load order, file size, URLs, DOM
order.

### 3.6 The price of learning an order

A perfectly consistent player cannot earn 2 bits per pick from the start,
under any predictor. Draw their order uniformly at random. Given the quads,
the predictor's probabilities of the possible pick sequences sum to at most
1, so by Gibbs' inequality the expected total shortfall $2T - S_T$ is at least
the entropy of the pick sequence. That entropy grows towards
$\log_2(N!/3!)$; the $3!$ is there because a consistent player never picks
their bottom three images, so best-of-4 never orders them.

| $N$ | 10 | 20 | 50 | 100 | 200 |
|---|---|---|---|---|---|
| $\log_2(N!/3!)$ bits | 19.2 | 58.5 | 211.6 | 522.2 | 1242.8 |

A uniform Bayesian mixture over all orders achieves exactly this, but it
cannot absorb a single slip. The predictor in §4 pays more. Simulated, a
consistent player under a single Bradley–Terry component ($\alpha = 1$) earns
about 0.45, 0.85 and 1.59 bits per pick around picks 32, 100 and 1000 at
$N = 50$, and 0.05, 0.37 and 1.19 at $N = 200$. **Set size is a
product lever**: large sets mean slow starts.

### 3.7 Speed against accuracy

A player making $r$ picks per second at $e(r)$ expected bits per pick scores
about $60\,r\,e(r)$ per session. The product $r\,e(r)$ is an information
throughput in bits per second, as in Hick–Hyman. Speed pays only while the
picks stay consistent, because fast random clicking has $e \le 0$.

### 3.8 What "consistent" means here

With a prior and fitting procedure that treat all images alike, the first
forecast is uniform, so the first pick of every player × set scores exactly
0. Relabelling the images leaves every score unchanged. **The score is
taste-neutral**: two players who differ only in which images they like score
the same.

It measures predictability *under the predictor's model*, i.e. consistency
with one latent utility order (transitivity plus Luce's independence of
irrelevant alternatives), not mere repeatability. A player who is perfectly
repeatable but intransitive scores about 0 under §4's model.

## 4. The forecast

### 4.1 Contract

A predictor is admissible if:

1. $p_t$ is a distribution over exactly the four shown images, every entry
   $> 0$;
2. it is a deterministic function of $H_{t-1}$ and $Q_t$ (never of screen
   position), computed and committed when the quad is served, before the pick;
3. it and all its parameters are fixed for a scoring epoch, or learned from
   past picks only. Changing it changes everyone's scores.

Under this contract §3 holds for every predictor. The predictor decides only
how fast consistent play is recognised: the $D_{\mathrm{KL}}$ term of §3.4. Scoring
with a model that has already seen $x_t$, or tuning parameters on the data
being scored, voids §3.5.

### 4.2 The record

The record of truth is the round log: $(Q_t, x_t)$, plus screen order, the
committed $p_t$ and the predictor version. $n$ is derived from it.

$n$ is enough for the pairwise fit below, which treats each pick as its three
pairwise wins. It is **not** a sufficient statistic for the exact one-of-four
(Luce) likelihood once $N \ge 6$: it drops which losers appeared together. Two
histories with the same $n$ can have different Luce likelihoods. Keep the log.

### 4.3 Component: strengths, Luce's rule, Beta prior, misclick floor

Each image has a strength $w_i = e^{\theta_i}$ for this player × set: a latent
order with noise. A component forecasts with Luce's choice rule, then mixes
in random misclicks with probability $\lambda$:

$$
p^{\alpha,\lambda}_t(i) = (1-\lambda)\,\frac{w_i}{\sum_{j \in Q_t} w_j} + \frac{\lambda}{k},
\qquad \text{two images: } P(i \succ j) = \frac{w_i}{w_i + w_j}\ \text{(Bradley–Terry)}.
$$

$\theta$ is the unique maximiser of the penalised pairwise log-likelihood

$$
\ell_\alpha(\theta) = \sum_{i \ne j} n_{ij} \log \sigma(\theta_i - \theta_j)
\;+\; \alpha \sum_i \big[\log \sigma(\theta_i) + \log \sigma(-\theta_i)\big],
\qquad \sigma(z) = \frac{1}{1+e^{-z}} .
$$

**Why the pairwise fit is sound.** Under Luce's rule, given that $i$ and $j$
were both shown and one of them was picked, $i$ was picked with probability
$w_i/(w_i + w_j)$ (independence of irrelevant alternatives). So each round's
pairwise score has conditional mean zero at the true strengths:

$$
\mathbb{E}\!\left[\frac{\partial \ell_{ij}}{\partial \theta_i} \,\middle|\, H_{t-1}, Q_t\right]
= \frac{w_i}{W_Q}\cdot\frac{w_j}{w_i+w_j} - \frac{w_j}{W_Q}\cdot\frac{w_i}{w_i+w_j} = 0,
\qquad W_Q = \sum_{m \in Q} w_m ,
$$

under any selection rule, adaptive ones included. The estimate is consistent
when information grows in every direction: every image keeps being shown,
and the pairs with growing counts connect all images. Uniform quads satisfy
this. A schedule that stops showing an image does not, even if the
comparison graph stays connected. The estimator is nearly efficient: its
simulated efficiency relative to the exact Luce fit is 0.94–0.99.

**Three wins are not three observations.** At equal strengths the curvature
of the pairwise likelihood per pick is $k/2 = 2$ times the Fisher information
of the true one-of-four likelihood: the overcount of §3.2 seen from the
fitting side. The point estimate is unaffected. Any use of $\ell$ as if it were
a likelihood is not: standard errors, posteriors, SPRT thresholds, and the
prior's relative weight, which effectively counts for half.

**Prior.** The $\alpha$ term is $\alpha$ virtual wins and $\alpha$ virtual losses per image
against a phantom image of fixed strength 1. Equivalently,
$\sigma(\theta_i) \sim \mathrm{Beta}(\alpha,\alpha)$: a priori, the chance that image $i$ beats an
average image is $\mathrm{Beta}(\alpha,\alpha)$, uniform at $\alpha = 1$. For $\alpha > 0$ the objective is
strictly concave and coercive, so the maximiser exists, is unique and is
finite for every history. Its effects:

- an image the player has never seen sits at $\theta = 0$, the average;
- an image that has never lost gets a large but finite strength;
- with no data the forecast is uniform (§3.8).

**Unseen pairs need nothing extra.** $P(i \succ j)$ follows from the strengths,
so A > B and B > C already forecast A > C. A per-pair estimate would wait for
data on each pair. Under uniform quads a given pair is decided in a round
with probability $6/(N(N-1))$ on average over pairs, so the typical wait is
$N(N-1)/6$ rounds, ≈ 670 at $N = 64$. Strengths have $N$ parameters, not $N(N-1)/2$.

**The misclick floor is mandatory.** Without it the strengths of a
consistent player spread without limit, because transitivity adds up the
gaps between adjacent ranks. Simulated at $N = 32$ after $10^4$ consistent
picks, one pick of a quad's second-best image would cost 18.6 bits on
average, and of its worst 41.7 bits. With the floor:

$$
\log_2 \lambda \;\le\; s_t \;\le\; 2 + \log_2\!\big(1 - \tfrac34\lambda\big).
$$

The price is a long-run ceiling just below 2 bits (1.97 at $\lambda = 1/32$). The
floor must be a mixture with uniform, as here; clipping probabilities
without renormalising breaks the contract.

**Fitting.** Hunter's MM iteration
$w_i \leftarrow (W_i+\alpha)\big/\big(\sum_{j\ne i}\frac{n_{ij}+n_{ji}}{w_i+w_j} + \frac{2\alpha}{w_i+1}\big)$,
$W_i = \sum_j n_{ij}$, converges monotonically. It is extremely slow on a
consistent player's nearly separable data, so use Newton in $\theta$, warm-started.
With exact convergence, ties split evenly, and no label-dependent shortcuts,
the result is label-free, as §3.8 requires.

### 4.4 Default predictor: a mixture

No single $\alpha$ suits everyone. A small $\alpha$ learns a consistent player fast but
is overconfident on a noisy one. Simulated over the first 60 picks of a noisy
player ($N = 20$), $\alpha = ½$ scored −4.4 bits, $\alpha = 1$ +3.7 and $\alpha = 4$ +9.8, against
23.3 for a forecaster that knows the player. But a consistent player's
long-run shortfall grows in proportion to $\alpha$. So do not choose: mix.

Components $m = 1,\dots,M$, with uniform prior weights $\pi_m = 1/M$:

| Component | Forecast |
|---|---|
| Luce, $\alpha \in \{¼, 1, 4\}$ | $p^{\alpha,\lambda}$ of §4.3 with $\lambda = 1/32$ |
| Sharp, $\lambda \in \{1/64, 1/16\}$ | $(1-\lambda)$ on the quad's top image under the $\alpha = 1$ strengths (ties split evenly), $+\,\lambda/k$ |
| Uniform | $1/k$ |

$M = 6$. Each component keeps the score it would have earned, $S^{(m)}_{t-1}$, and

$$
p_t = \sum_m \pi_{m,t}\, p^{(m)}_t,
\qquad
\pi_{m,t} = \frac{\pi_m\, 2^{S^{(m)}_{t-1}}}{\sum_{m'} \pi_{m'}\, 2^{S^{(m')}_{t-1}}} .
$$

This is the Bayesian posterior over components, and it is itself an
admissible predictor. The weights telescope to $2^{S_T} = \sum_m \pi_m\, 2^{S^{(m)}_T}$,
hence

$$
S_T \;\ge\; \max_m S^{(m)}_T - \log_2 M \qquad (\log_2 6 = 2.58\ \text{bits}).
$$

Consequences:

- the mixture is never more than 2.58 bits behind the best component in
  hindsight, for any player;
- because the uniform component scores 0 forever, **no player's cumulative
  LLR ever falls below −2.58 bits**;
- every component floors at $\lambda \ge 1/64$, so a single pick costs at most
  6 bits;
- the sharp components carry the fast learning that a consistent player is
  owed (§3.6).

These are design defaults, chosen so that the exact values matter little.
Revisit them with real players.

### 4.5 Alternatives not chosen

| Alternative | Why not the default |
|---|---|
| Per-pair Beta-smoothed $\hat p_{ij}$, composed over the quad | No transitivity; forecasts uniform on any quad whose pairs are unseen. Simulated at $N=100$ after 500 picks: 66 bits for a perfect player, against 672 for a strength-based mixture. |
| Normalised product $\prod_{j\ne i}\hat p_{ij}$ | Not Luce even when $\hat p$ is Bradley–Terry; over-sharp ($w = (2,1,1,1)$: 0.542 against Luce's 0.4). |
| Geometric odds $\prod_{j\ne i}(\hat p_{ij}/\hat p_{ji})^{1/k}$ | Reduces exactly to Luce for Bradley–Terry inputs ($1/k$ is the only such exponent), so it is the right way to compose a pairwise matrix. A candidate extra mixture component for intransitive players, once per-pair data exist (small sets, exact repeats). |
| Exact Luce likelihood from the round log, Bayesian (Caron–Doucet) | Coherent, with honest early uncertainty. Costs $O(T)$ per refit. An admissible drop-in, and the natural upgrade if real players show the pairwise fit's calibration matters. |

## 5. Consistency score

The cumulative LLR grows with play. The consistency score should not: it
should say how predictable the player is, per pick.

**Target.** The fraction of the 2-bit maximum that a fully learned forecaster
earns on this player, over reference quads $Q$ drawn uniformly:

$$
\kappa = \frac{\mathbb{E}_Q\big[\log_2 k - H(q_Q)\big]}{\log_2 k} = 1 - \frac{\mathbb{E}_Q\, H(\text{choice} \mid Q)}{\log_2 k} \in [0,1].
$$

$\kappa$ is 1 for a player who always picks their favourite and 0 for one who
picks at random. A player who picks the quad's favourite with probability
$1-e$, and otherwise one of the other three at random, has $\kappa$ = 0.91, 0.82, 0.69, 0.48 at $e$ = 0.02, 0.05, 0.1, 0.2. It is the
long-run slope of $S_T/(2T)$.

**Estimators**, over a recent window (e.g. an exponentially weighted ~100
picks):

- *Realised*: $\hat\kappa = \overline{s_t}/2$. Out of sample, so honest. It can be
  negative, and it is biased low while the model is learning (§3.6). It is
  McFadden's likelihood-ratio index with the equal-probability null, computed
  prequentially.
- *Model-implied*: the mean of $\big(\log_2 k - H(p_t(\cdot \mid Q))\big)/2$ over a fixed
  reference sample of quads. Smooth and available from the first session.

The two agree once the model has learned the player; a persistent gap means
the forecasts are miscalibrated. Show the realised value, and use the gap as
a health check. Both depend on the selection policy, so define them under the
uniform reference selector.

## 6. Identity verification

Use the same per-pick primitive with a different denominator:
$\log_2\!\big(p_A(x_t)/p_{\text{ref}}(x_t)\big)$. Here $p_A$ forecasts from the claimed player's
history, and $p_{\text{ref}}$ is a population predictive updated on the session so far.
Summed over a session, this is Wald's SPRT statistic: accept above
$\log_2\frac{1-\beta}{\alpha}$, reject below $\log_2\frac{\beta}{1-\alpha}$. The game score is the special
case $p_{\text{ref}} = $ uniform.

Differences from the game score:

- per-pick LLRs are no longer capped at 2 bits;
- the error guarantees hold only to the extent that impostors' real choices
  follow $p_{\text{ref}}$. For a specific look-alike they do not. In simulation, a
  nominal 1% false-accept rate became 1.7–4.7%;
- thresholds need empirical calibration;
- never use differences of the pairwise $\ell$ (§4.3) as SPRT log-likelihood
  ratios.

## 7. Consequences and limits

- **Display.** Shuffle screen positions server-side, fresh for every
  presentation including repeats. Reveal all four images together. Use opaque
  per-round image URLs. The predictor never sees position.
- **Commitment.** Compute and store $p_t$ when the quad is served, then score,
  then update. Serialise concurrent submissions (two tabs). Never combine a
  strength and a log-sum-exp from different model versions; a stale
  normaliser can push $s_t$ above 2.
- **Versioning.** Scores are comparable only under one predictor version,
  selection policy and set size.
- **Selection changes the scale.** By §3.4, points = 2 − noise − learning, so
  "max information" quads deliberately pay less. In simulation, a
  max-entropy selector cut points about 5× (0.14 against 0.69 bits per pick),
  and a confidence-seeking selector inflated them (1.34). Score rounds under
  a fixed policy.
- **Multiple testing.** §3.5 is per player × set. Anonymous IDs make
  re-rolling free: with 1000 random-clicking IDs, some ID reached 10 bits in
  about 30% of simulations. Leaderboards and identity thresholds must account
  for the number of IDs and sessions. Never discard or retry sessions.
- **Consistency is not sincerity.** Any fixed rule on image content ("the
  brightest", a hash of the pixels) is perfectly consistent and earns close to
  2 bits per pick, at machine speed for a bot. Anti-automation (rate limits, a
  minimum response time) is needed from the start, not deferred.
- **Total order.** "Accumulated matches converge toward a total ordering" is
  false at the bottom. A consistent player's bottom three images are never
  picked, and under uniform quads the image fourth from the bottom is picked
  only when the quad is exactly the bottom four. Ordering the low end needs
  adaptive quads of similar images.
- **Changing taste.** Old picks keep full weight, so a player whose taste
  drifts pays for it for a long time. Discounting old counts
  ($n \leftarrow \gamma n$ per round) keeps the predictor admissible.
- **IIA.** Real choices among four can violate Luce's independence of
  irrelevant alternatives (decoy and compromise effects). The score stays
  valid; the predictor's calibration (§5's gap) is the thing to watch.
- **Numerics.** Compute
  $s_t = \log_2 k - \operatorname{LSE}_{j \in Q_t}(\theta_j - \theta_{x_t})/\ln 2$ (max-shifted log-sum-exp)
  for each component, and mix in probability space. Then $s_t \le 2$ and
  $\tfrac1k\sum_x 2^{s(x)} \le 1$ hold to rounding. Reject non-finite strengths.

## References

- Azari Soufiani, H., Parkes, D. C., & Xia, L. (2014). Computing parametric ranking models via rank-breaking. *ICML 2014*, PMLR 32(1), 360–368.
- Bradley, R. A., & Terry, M. E. (1952). Rank analysis of incomplete block designs: I. The method of paired comparisons. *Biometrika*, 39(3/4), 324–345.
- Caron, F., & Doucet, A. (2012). Efficient Bayesian inference for generalized Bradley–Terry models. *J. Computational and Graphical Statistics*, 21(1), 174–196.
- Cover, T. M., & Thomas, J. A. (2006). *Elements of Information Theory*, 2nd ed., ch. 6. Wiley.
- Dawid, A. P. (1984). Statistical theory: the prequential approach. *JRSS A*, 147(2), 278–292.
- Gneiting, T., & Raftery, A. E. (2007). Strictly proper scoring rules, prediction, and estimation. *JASA*, 102(477), 359–378.
- Good, I. J. (1952). Rational decisions. *JRSS B*, 14(1), 107–114.
- Hauser, J. R. (1978). Testing the accuracy, usefulness, and significance of probabilistic choice models: an information-theoretic approach. *Operations Research*, 26(3), 406–421.
- Hick, W. E. (1952). On the rate of gain of information. *Q. J. Experimental Psychology*, 4(1), 11–26.
- Hunter, D. R. (2004). MM algorithms for generalized Bradley–Terry models. *Annals of Statistics*, 32(1), 384–406.
- Hyman, R. (1953). Stimulus information as a determinant of reaction time. *J. Experimental Psychology*, 45(3), 188–196.
- Khetan, A., & Oh, S. (2016). Data-driven rank breaking for efficient rank aggregation. *JMLR*, 17(193), 1–54.
- Luce, R. D. (1959). *Individual Choice Behavior: A Theoretical Analysis*. Wiley.
- McFadden, D. (1974). Conditional logit analysis of qualitative choice behavior. In *Frontiers in Econometrics*, 105–142. Academic Press.
- Ramdas, A., Grünwald, P., Vovk, V., & Shafer, G. (2023). Game-theoretic statistics and safe anytime-valid inference. *Statistical Science*, 38(4), 576–601.
- Shafer, G., Shen, A., Vereshchagin, N., & Vovk, V. (2011). Test martingales, Bayes factors and p-values. *Statistical Science*, 26(1), 84–101.
- Varin, C., Reid, N., & Firth, D. (2011). An overview of composite likelihood methods. *Statistica Sinica*, 21(1), 5–42.
- Ville, J. (1939). *Étude critique de la notion de collectif*. Gauthier-Villars.
- Wald, A. (1945). Sequential tests of statistical hypotheses. *Annals of Mathematical Statistics*, 16(2), 117–186.
- Wichmann, F. A., & Hill, N. J. (2001). The psychometric function: I. Fitting, sampling, and goodness of fit. *Perception & Psychophysics*, 63(8), 1293–1313.
