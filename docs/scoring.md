# likelylikes — scoring

Status: design (mathematics only). Resolves *Core model → Scoring* and the
open questions on the LLR formulation and unseen pairs in
[requirements.md](requirements.md); proposes a consistency score (§7).

## Summary

- Everything is built from one number per pair of images, the **pairwise
  log likelihood ratio** $L_{ij} = \log_2\frac{n_{ij}+1}{n_{ji}+1}$ bits, read straight off the win
  counts. There is no fitting.
- A pick of $x$ from quad $Q$ scores

  $$s = 2 - \log_2\Big(1 + \sum_{j \in Q,\, j \ne x} 2^{-L_{xj}}\Big)\ \text{bits},$$

  the log₂ likelihood ratio of the pick against random clicking. Only the
  three pairs between the picked image and the other three enter.
- **At most 2 bits per pick.** A pick scores 0 when nothing is known about
  its pairs. A slip costs a number of bits logarithmic in the evidence
  against it.
- The **cumulative LLR** is the sum of the per-pick scores. A random clicker
  ever reaches $b$ bits with probability at most $2^{-b}$.
- Adding the three pairwise LLRs instead is not the likelihood ratio of the
  pick (§3.4).
- The cost of using pairs alone: a pair never compared counts as a coin
  flip, so learning a consistent player takes on the order of $N^2$ picks
  (§4.5).

## 1. Setting

| Symbol | Meaning |
|---|---|
| $N$ | images in the set |
| $Q$ | the quad shown in a round; $\lvert Q\rvert = 4$ |
| $x \in Q$ | the image picked |
| $n_{ij}$ | win count: rounds in which $i$ was picked while $j$ was shown |
| $L_{ij}$ | pairwise LLR (§2) |
| $s$ | the score of one pick (§3) |
| $S_T$ | cumulative LLR after $T$ picks |

Everything is per player × set. A pick of $x$ from $Q$ adds 1 to $n_{xj}$ for each
of the three $j \in Q \setminus \{x\}$. The three pairs among the images not picked are not
decided by the pick and get nothing.

## 2. The pairwise log likelihood ratio

Fix two images $i$ and $j$. Call a round *decided* for the pair when both were
shown and one of them was picked. Suppose each decided round goes to $i$ with
a fixed chance $\pi_{ij}$, and to $j$ with $\pi_{ji} = 1 - \pi_{ij}$. The log likelihood ratio of the
two outcomes is $\log_2(\pi_{ij}/\pi_{ji})$: how many bits more likely it is that $i$ beats $j$ than
that $j$ beats $i$.

The counts estimate it. With no prior opinion about $\pi_{ij}$ (uniform on $[0,1]$),
after $n_{ij}$ wins for $i$ and $n_{ji}$ for $j$ the chance that the next decided round goes
to $i$ is $(n_{ij}+1)/(n_{ij}+n_{ji}+2)$ (Laplace's rule of succession). The log ratio of the two
outcomes' chances is

$$
L_{ij} = \log_2 \frac{n_{ij}+1}{n_{ji}+1}\quad\text{bits}.
$$

Properties, all read off the formula:

- $L_{ji} = -L_{ij}$, and $L_{ii} = 0$.
- $L_{ij} = 0$ for a pair never decided, or tied.
- One more win for $i$ adds $\log_2\frac{n_{ij}+2}{n_{ij}+1} \le 1$ bit. Evidence accumulates
  logarithmically: $L_{ij} \le \log_2(1 + n_{ij})$.

| $n_{ij}$ | 0 | 1 | 3 | 7 | 5 | 10 | 100 | 100 |
|---|---|---|---|---|---|---|---|---|
| $n_{ji}$ | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 10 |
| $L_{ij}$ (bits) | 0 | 1 | 2 | 3 | 1.58 | 3.46 | 6.66 | 3.20 |

## 3. The score of a pick

### 3.1 From pairs to a pick from four

Suppose, for this derivation only, that each image has a strength $w > 0$ and
the player picks $x$ from $Q$ with probability $w_x / \sum_{y \in Q} w_y$. For a single pair this
gives $\pi_{xj} = w_x/(w_x+w_j)$, so the pair's LLR is $\log_2(w_x/w_j)$. Divide the top and the
bottom of the pick probability by $w_x$:

$$
P(x \mid Q) = \frac{1}{\sum_{y \in Q} w_y/w_x}
= \frac{1}{1 + \sum_{j \in Q,\, j \ne x} 2^{-\log_2(w_x/w_j)}} .
$$

The probability of a pick from four is fixed by the three pairwise LLRs of
the picked image against the other three. Putting in the estimates $L$ gives
the forecast

$$
p(x \mid Q) = \frac{1}{1 + \sum_{j \in Q,\, j \ne x} 2^{-L_{xj}}}
= \frac{1}{1 + \sum_{j \in Q,\, j \ne x} \frac{n_{jx}+1}{n_{xj}+1}} .
$$

Each term of the sum is the odds *against* the picked image in one of its
three pairs. The strength assumption is used only to find this formula. The
guarantees in §4 hold for any counts, whether or not the player behaves
like this.

### 3.2 The score

The reference is a player who clicks at random, $P_0(x \mid Q) = 1/4$. The score is
the log₂ likelihood ratio of the pick, forecast against random:

$$
s = \log_2 \frac{p(x \mid Q)}{1/4}
= 2 - \log_2\Big(1 + \sum_{j \in Q,\, j \ne x} 2^{-L_{xj}}\Big)
= 2 - \log_2 \sum_{y \in Q} 2^{L_{yx}} \quad\text{bits}.
$$

The last form uses $2^{-L_{xj}} = 2^{L_{jx}}$; its $y = x$ term is $2^0 = 1$.

Two rules fix the order:

- **Indices.** Inside the sum, the rival's wins over the picked image go on
  top: $(n_{jx}+1)/(n_{xj}+1)$.
- **Time.** The counts are those from *before* this pick; the update comes
  after the score. Counts that already include the pick would give a random
  clicker's first pick $2 - \log_2 2.5 = 0.68$ bits instead of 0.

The cumulative LLR after $T$ picks is the log of the product of the per-pick
likelihood ratios:

$$
S_T = \sum_{t=1}^{T} s_t = \log_2 \prod_{t=1}^{T} \frac{p_t(x_t \mid Q_t)}{1/4} .
$$

A session's score is its gain $G = \sum_{t \in \text{session}} s_t$. Every quad served before the
deadline counts. Per-round points are signed and are never clamped.

### 3.3 Worked values

A pick of $x$, with $m$ past decided rounds in each pair that has any:

| The picked image's three pairs | formula | $m=1$ | 3 | 10 | 100 |
|---|---|---|---|---|---|
| none decided | $0$ | 0 | 0 | 0 | 0 |
| beat each rival $m$ times, never lost | $2 - \log_2\big(1 + \tfrac{3}{m+1}\big)$ | 0.68 | 1.19 | 1.65 | 1.96 |
| beat one rival $m$ times, other two pairs undecided | $2 - \log_2\big(3 + \tfrac{1}{m+1}\big)$ | 0.19 | 0.30 | 0.37 | 0.41 |
| lost to one rival $m$ times, other two undecided | $2 - \log_2(m + 4)$ | −0.32 | −0.81 | −1.81 | −4.70 |
| lost to each rival $m$ times | $2 - \log_2(3m + 4)$ | −0.81 | −1.70 | −3.09 | −6.25 |

The third row shows the cost of pairs alone. One known pair, however
lopsided, is worth at most $2 - \log_2 3 = 0.415$ bits while the other two pairs are
coin flips.

### 3.4 Why not add the three pairwise LLRs

The tempting score $\sum_{j \ne x} L_{xj}$ treats one pick as three independent wins. It is
one event, "$x$ is the best of these four", with probability ¼ under random
clicking, not $(\tfrac12)^3$. As a result:

- **No ceiling.** A pick that has beaten each rival $m$ times scores $3\log_2(m+1)$,
  which is 20 bits at $m = 100$ against 1.96 in §3.3. Points grow with how long
  someone has played, not only with how consistently.
- **No guarantee against random clicking.** Under random clicking the sum
  averages exactly 0, because $L$ is antisymmetric and the four possible
  picks' sums cancel. But the average of $2^{\text{sum}}$ is then above 1 unless all four
  sums are equal (an average of $2^v$ is at least 2 to the average of $v$). The
  argument of §4.3 fails, and nothing bounds how often a random clicker
  reaches a high total.

The row sum of $L$ is the right statistic for *ordering* images (§6). It is the
wrong one for *scoring* a pick.

## 4. Properties

### 4.1 Range

Let $M_x = \max\big(0,\ \max_{j \in Q} L_{jx}\big)$: the largest LLR any rival holds against $x$, or 0.
The sum $\sum_{y \in Q} 2^{L_{yx}}$ has four terms, the largest being $2^{M_x}$, so it lies between $2^{M_x}$
and $4 \cdot 2^{M_x}$. Hence

$$
-M_x \;\le\; s \;\le\; 2 - M_x .
$$

A pick's score is set by its worst pair, to within 2 bits. In counts:

- $s < 2$ always, because every term of the sum is positive;
- $s = 0$ when none of the picked image's three pairs has been decided;
- $(n_{jx}+1)/(n_{xj}+1) \le n_{jx}+1$, so $s \ge -\log_2\big(1 + A_x/4\big)$, where $A_x = \sum_{j \in Q \setminus \{x\}} n_{jx}$ counts the
  times the other three have beaten $x$.

A slip therefore costs bits logarithmic in the evidence against it. The $+1$
is the only protection needed; there is no separate misclick floor.

### 4.2 Random clicking never pays

**Claim.** For every quad and any counts, the four forecasts sum to at most 1:
$\sum_{x \in Q} p(x \mid Q) \le 1$.

*Proof.* Write $r_{jx} = 2^{L_{jx}} = (n_{jx}+1)/(n_{xj}+1)$. Then $r_{jx}\,r_{xj} = 1$ and $r_{xx} = 1$. By §3.1,
$p_x = 1/\sum_{j \in Q} r_{jx}$, that is, $\sum_{j \in Q} r_{jx}\,p_x = 1$ for each $x$. Multiply by $p_x$ and add over $x$:

$$
S = \sum_x p_x = \sum_x \sum_j r_{jx}\,p_x^2
= \sum_x p_x^2 + \sum_{\{x,j\}} \big(r_{jx}\,p_x^2 + r_{xj}\,p_j^2\big),
$$

the last sum running over the six unordered pairs of the quad. Since
$a + b \ge 2\sqrt{ab}$ and $r_{jx}\,r_{xj} = 1$, each pair term is at least $2\,p_x p_j$. So
$S \ge \sum_x p_x^2 + 2\sum_{\{x,j\}} p_x p_j = S^2$, hence $S \le 1$. ∎

Equality holds exactly when $r_{jx}\,p_x^2 = r_{xj}\,p_j^2$ for every pair, i.e. $L_{jx} = \log_2 p_j - \log_2 p_x$.
The LLRs on the quad are then differences of one number per image, so they
add up along chains: $L_{ab} + L_{bc} = L_{ac}$. When the counts contradict each other
(A over B, B over C, C over A), some probability goes to no image, and every
pick from that quad scores $\log_2(1/S)$ bits less than it would if the forecast
were rescaled to sum to 1.

**Consequence.** A random clicker picks each image of $Q$ with probability ¼,
whatever happened before, so

$$
\mathbb{E}_0\big[2^{s}\big] = \tfrac14 \sum_{x \in Q} 4\,p(x \mid Q) = S \le 1,
\qquad
\mathbb{E}_0[s] \le \log_2 \mathbb{E}_0\big[2^{s}\big] \le 0 .
$$

The second inequality holds because the average of a log is at most the log
of the average. The proof uses only $L_{ji} = -L_{ij}$, so it holds for any
antisymmetric $L$ (§5).

### 4.3 The cumulative LLR and the guarantee

Think of $2^{S_T}$ as the wealth of someone betting against random clicking,
starting from 1. By §4.2 each pick multiplies the wealth by a factor that
averages at most 1 under random clicking, whatever came before.

**Guarantee.** For a random clicker,

$$
P_0\big(\exists\,T:\ S_T \ge b\big) \le 2^{-b}.
$$

*Proof.* Stop at the first pick at which $S$ reaches $b$, or at the horizon.
Stopping cannot raise the average wealth above 1, because each factor
averages at most 1 whether or not we have stopped. On the event, the wealth
at the stop is at least $2^b$. So $2^b \cdot P_0(\text{event}) \le 1$. Let the horizon grow. ∎
(This is Ville's inequality.)

The bound covers every moment, so it holds at the end of a 60-second session
whatever the number of picks. It also holds for one session's gain given the
earlier history: $P_0(G \ge b) \le 2^{-b}$. A random clicker reaches a 10-bit session
with probability at most 1/1024. The bound applies per player × set, for $b$
fixed in advance. It says nothing about the best of many sessions or many
anonymous IDs (§9).

**What $S_T$ is.** $2^{S_T}$ is the likelihood ratio of the whole record, "the player
picks as the counts forecast" against "the player clicks at random". The
quads come from a selection rule that uses only past rounds and the server's
own randomness. Its probabilities are the same under both hypotheses and
cancel. The leftover forecast $1 - S$ goes to no image; some image is always
picked, so that mass is pure loss and keeps the ratio conservative.

**Position play is random play.** Assume the display order is a fresh uniform
shuffle, drawn server-side for every presentation, and the scorer never sees
screen positions. Then any strategy that uses only positions, the player's
own timing and past rounds makes $x$ uniform on $Q$ as far as the counts can
tell. That is random clicking, so §4.2 and §4.3 apply. Content-dependent side
channels break this: image load order, file size, URLs, DOM order.

### 4.4 What a pick is worth on average

Let $q$ be the player's actual choice probabilities on $Q$. Then

$$
\mathbb{E}_q[s] = \underbrace{\big(2 - H(q)\big)}_{\text{predictability of the pick}}
\;-\; \underbrace{D(q \,\|\, p)}_{\text{forecast error}},
\qquad
H(q) = -\sum_x q_x \log_2 q_x,
\quad
D(q \,\|\, p) = \sum_x q_x \log_2 \frac{q_x}{p_x} .
$$

*Proof.* $\sum_x q_x \log_2(4p_x) = 2 + \sum_x q_x \log_2 q_x - \sum_x q_x \log_2(q_x/p_x)$. ∎

- The first term lies in $[0, 2]$. It is 2 bits for a player who would always
  pick the same image from these four, and 0 for one who picks at random. It
  is the most this quad can earn on average.
- The second term is never negative, even though $p$ may sum to less than 1:
  $-D = \sum_x q_x \log_2(p_x/q_x) \le \log_2 \sum_x p_x \le 0$. It is 0 only if $p = q$. A forecast that has not
  learned the player yet costs points and never adds any.
- With $q$ uniform, $\mathbb{E}[s] = -D \le 0$: §4.2 again.

### 4.5 Learning a consistent player

A *consistent* player has a fixed order and always picks the quad's top
image. Then $n_{jx} = 0$ for the pick $x$ and each rival $j$, every ratio is $1/(n_{xj}+1) \le 1$,
and

$$
0 \;\le\; s \;=\; 2 - \log_2\Big(1 + \sum_{j} \frac{1}{n_{xj}+1}\Big) \;<\; 2 .
$$

A consistent player never loses points. Their shortfall from 2 bits is
bounded by a telescoping sum. Since $1 + a + b + c \le (1+a)(1+b)(1+c)$ for non-negative
$a, b, c$,

$$
2 - s \;\le\; \sum_{j} \log_2\Big(1 + \frac{1}{n_{xj}+1}\Big) = \sum_{j} \log_2 \frac{n_{xj}+2}{n_{xj}+1},
$$

and the pick then raises each of those three counts by one. Over a pair's
first $n$ decided rounds the terms are $\log_2\frac21 + \log_2\frac32 + \dots + \log_2\frac{n+1}{n} = \log_2(n+1)$. Adding over
pairs, for any sequence of quads and any selection rule,

$$
2T - S_T \;\le\; \sum_{\text{pairs}} \log_2(1 + n_{ij}) \;\le\; P \log_2\Big(1 + \frac{3T}{P}\Big),
\qquad P = \frac{N(N-1)}{2} - 3 .
$$

The second step uses that the counts add up to $3T$ and that $\log_2(1+n)$ is
concave. $P$ is the number of pairs a consistent player can ever decide: the
three pairs among their bottom three images never are. Per pick, averaged
over the first $T$:

$$
\frac{S_T}{T} \;\ge\; 2 - \frac{P}{T}\log_2\Big(1 + \frac{3T}{P}\Big).
$$

| $N$ | $T = 60$ | 300 | 1000 | 10 000 | picks to guarantee a 1 bit/pick average |
|---|---|---|---|---|---|
| 10 | 0.32 | 1.37 | 1.74 | 1.96 | 149 |
| 20 | 0 | 0.42 | 1.23 | 1.86 | 662 |
| 50 | 0 | 0 | 0 | 1.43 | 4 323 |
| 100 | 0 | 0 | 0 | 0.60 | 17 501 |

A 0 marks where the bound falls below the trivial $s \ge 0$. These are
guarantees, so real scores can only be higher. The last column solves
$\log_2(1+u) = u/3$, giving $u = 10.6$ and $T = uP/3 \approx 1.8\,N^2$.

The $N^2$ is the price of using pairs alone. Each of the roughly $N^2/2$ pairs must
be decided on its own, and a given pair is decided on average once every
$N(N-1)/6$ picks, since each pick decides 3 of the $N(N-1)/2$ pairs. For comparison,
the unavoidable cost for any scorer is the information in the player's
order, which approaches $\log_2(N!/3!)$ bits in total: 19, 59, 212 and 522 bits at
$N$ = 10, 20, 50, 100. The bound above grows like $\tfrac{N^2}{2}\log_2 T$. **Set size is a
product lever**: large sets mean slow starts.

### 4.6 Learning a noisy player

Suppose the player's choices do follow the strength model of §3.1. In a
round that shows both $i$ and $j$, $i$ is picked with probability $w_i/W_Q$ and $j$ with
$w_j/W_Q$, where $W_Q$ is the quad's total strength. The ratio is $w_i/w_j$ whatever the
other two images are. So as long as every pair keeps being shown,
$n_{ij}/n_{ji} \to w_i/w_j$ and $L_{ij} \to \log_2(w_i/w_j)$. The forecast of §3.1 becomes exact, $D \to 0$, and the
score per pick tends to $2 - H(q)$, the most any scorer can earn from that
player (§4.4). Noise costs a player its information content and nothing
more.

### 4.7 What "consistent" means here

- **Taste-neutral.** The formula treats all images alike, so relabelling the
  images leaves every score unchanged, and every player's first pick in a set
  scores 0. Two players who differ only in which images they like score the
  same.
- **Pairwise repeatability.** The score rewards picking the same image over
  the same rival again. It does not impose a single order on the whole set:
  A over B and B over C say nothing about A against C. Within one quad,
  counts that contradict each other lose probability (§4.2) and lower every
  pick from that quad.

### 4.8 Speed against accuracy

A player making $r$ picks per second at $e(r)$ bits per pick on average scores
about $60\,r\,e(r)$ per 60-second session. The product $r\,e(r)$ is an information
rate in bits per second. Speed pays only while the picks stay consistent,
because fast random clicking has $e \le 0$.

## 5. The LLR estimator

The score of §3 takes any matrix $L$ of pairwise LLRs; the requirements make
the estimator pluggable. An estimator is admissible if:

1. $L_{ji} = -L_{ij}$, finite for every pair;
2. it is computed from earlier picks only (counts, or the round log), before
   the pick it scores, and never from screen positions;
3. it treats all images alike;
4. it is fixed for a scoring epoch. Changing it changes everyone's scores.

Under this contract §4.1–§4.4 hold, since they use only antisymmetry. §4.5
is specific to the default.

**Default.** $L_{ij} = \log_2\frac{n_{ij}+1}{n_{ji}+1}$ (§2). The $+1$ is the uniform prior on each pair.

**Variants.**

- *Discounting*, for changing taste: multiply all counts by $\gamma < 1$ each round
  before the update. Still admissible; old picks fade.
- *Strength-based LLRs*: $L_{ij} = \log_2(w_i/w_j)$, with strengths fitted to all the counts.
  The LLRs then add up along chains, §4.2 holds with equality, and an
  undecided pair gets a value from the pairs around it, so large sets are
  learned from far fewer picks. The costs: a fit over all images after every
  pick, and a consistent player's fitted strengths grow without limit, so a
  slip can cost unbounded bits unless the forecast is mixed with random
  clicking. The natural upgrade if sets are large.

## 6. Ordering

The requirements ask for a per-player ordering. Rank images by the row sum

$$
R_i = \sum_{j \ne i} L_{ij}
$$

over all images in the set; undecided pairs add 0. If the LLRs come from
strengths, $L_{ij} = \log_2 w_i - \log_2 w_j$, then $R_i = N\,(\log_2 w_i - \overline{\log_2 w})$, and $R$ ranks by strength.

"Accumulated matches converge toward a total ordering" is false at the
bottom. A consistent player never picks their bottom three images, so the
three pairs among them are never decided. Under uniform quads, the image
fourth from the bottom is picked only when the quad is exactly the bottom
four. Ordering the low end needs adaptive quads of similar images.

## 7. Consistency score

The cumulative LLR grows with play. The consistency score should not: it
should say how predictable the player is, per pick.

**Target.** The fraction of the 2-bit maximum that a fully learned forecast
earns on this player, over reference quads $Q$ drawn uniformly:

$$
\kappa = 1 - \frac{\mathbb{E}_Q\, H(\text{choice} \mid Q)}{2} \in [0, 1] .
$$

$\kappa$ is 1 for a player who always picks their favourite and 0 for one who
picks at random. A player who picks the quad's favourite with probability
$1-e$, and otherwise one of the other three at random, has $\kappa$ = 0.91, 0.82, 0.69,
0.48 at $e$ = 0.02, 0.05, 0.1, 0.2. It is the long-run slope of $S_T/(2T)$ once the
forecast is exact (§4.4, §4.6).

**Estimators**, over a recent window (e.g. an exponentially weighted ~100
picks):

- *Realised*: $\hat\kappa = \overline{s}/2$. Out of sample, so honest. It can be negative, and
  it is biased low by $\overline{D}/2$ while the counts are still filling (§4.4).
- *Model-implied*: the mean of $\big(2 - H(\tilde p(\cdot \mid Q))\big)/2$ over a fixed reference sample of
  quads, where $\tilde p = p/S$ is the forecast rescaled to sum to 1. Smooth and
  available from the first session.

The two agree once the counts have learned the player; a persistent gap
means the forecasts are miscalibrated. Show the realised value, and use the
gap as a health check. Both depend on the selection policy, so define them
under uniform selection.

## 8. Identity verification

Use the same per-pick primitive with a different reference. For a session
claimed to be player A, score each pick by $\log_2\big(\tilde p_A(x \mid Q)/\tilde p_{\text{ref}}(x \mid Q)\big)$. Here $\tilde p_A$ is
§3.1's forecast from A's counts and $\tilde p_{\text{ref}}$ the same from pooled population
counts, both rescaled to sum to 1. Summed over the session, this is Wald's
sequential test: accept above $\log_2\frac{1-\beta}{\alpha}$ and reject below $\log_2\frac{\beta}{1-\alpha}$, where $\alpha$ is
the false-accept rate and $\beta$ the false-reject rate. The game score is the
special case $\tilde p_{\text{ref}} = ¼$.

Differences from the game score:

- per-pick values are not capped at 2 bits;
- the error rates hold only to the extent that impostors' real choices follow
  $\tilde p_{\text{ref}}$. A specific look-alike's do not, so thresholds need empirical
  calibration;
- never use sums of pairwise LLRs (§3.4) as the test statistic.

## 9. Consequences and limits

- **Display.** Shuffle screen positions server-side, fresh for every
  presentation including repeats. Reveal all four images together. Use opaque
  per-round image URLs. The scorer never sees position.
- **Order of operations.** Score each pick from the counts as they stand
  before its own update, then update. Serialise submissions per player × set
  (two tabs).
- **Storage.** The scorer needs only the $N \times N$ counts per player × set: three
  lookups to score a pick, three increments to update. Keep the round log
  $(Q, x)$, with screen order and estimator version, anyway: for audit, and to
  re-score under a new estimator.
- **Versioning.** Scores are comparable only under one estimator version,
  selection policy and set size.
- **Selection changes the scale.** By §4.4, quads the forecast is unsure about
  pay less. A "max information" selector serves them on purpose and lowers
  points; a selector that favours well-known pairs inflates them. Score
  rounds under a fixed policy.
- **Multiple testing.** §4.3 is per player × set. Anonymous IDs make
  re-rolling free: with $M$ random-clicking IDs, the chance that some ID reaches
  $b$ bits is bounded only by $M \cdot 2^{-b}$, which is 0.98 for 1000 IDs at 10 bits.
  Leaderboards and identity thresholds must account for the number of IDs
  and sessions. Never discard or retry sessions.
- **Consistency is not sincerity.** Any fixed rule on image content ("the
  brightest", a hash of the pixels) is perfectly consistent and earns close to
  2 bits per pick, at machine speed for a bot. Anti-automation (rate limits, a
  minimum response time) is needed from the start, not deferred.
- **Changing taste.** Old picks keep full weight, so a player whose taste
  drifts pays for it for a long time. Discounting (§5) fixes this.
- **Real choices.** Choices among four can break the strength model of §3.1
  (decoy and compromise effects). The score stays valid, since §4.2 does not
  use the model; the forecast's calibration (§7's gap) is the thing to watch.
- **Numerics.** With integer counts, compute the ratio form directly,
  $s = 2 - \log_2\big(1 + \sum_j (n_{jx}+1)/(n_{xj}+1)\big)$; nothing overflows at realistic counts. With
  real-valued $L$ (discounting, strengths), shift by the largest exponent:
  $s = 2 - M_x - \log_2 \sum_{y \in Q} 2^{L_{yx} - M_x}$.

## References

- Bradley, R. A., & Terry, M. E. (1952). Rank analysis of incomplete block designs: I. The method of paired comparisons. *Biometrika*, 39(3/4), 324–345.
- Cover, T. M., & Thomas, J. A. (2006). *Elements of Information Theory*, 2nd ed. Wiley.
- Laplace, P.-S. (1814). *Essai philosophique sur les probabilités*. Courcier.
- Luce, R. D. (1959). *Individual Choice Behavior: A Theoretical Analysis*. Wiley.
- Ville, J. (1939). *Étude critique de la notion de collectif*. Gauthier-Villars.
- Wald, A. (1945). Sequential tests of statistical hypotheses. *Annals of Mathematical Statistics*, 16(2), 117–186.
