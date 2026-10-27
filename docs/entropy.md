# likelylikes — authentication entropy

Status: design (mathematics only). Bounds the identity use case of
[requirements.md](requirements.md): at most how many bits of authentication
a player's choices among $N$ images can carry. Complements
[scoring.md](scoring.md) §8, which gives the test statistic but not its
ceiling.

## Summary

- A best-of-four pick never shows the order of a player's bottom three
  images. All the game can ever see of a ranking is its top $N-3$ places, in
  order. There are $N!/3!$ of these *observable rankings* (§2).
- The **maximum entropy** of an observable ranking is

  $$H_{\max}(N) = \log_2\frac{N!}{3!} \approx N\log_2 N - 1.44\,N\ \text{bits},$$

  reached only when every observable ranking is equally common in the
  population (§3). It is 19 bits at $N = 10$, 58 at $N = 20$, 212 at
  $N = 50$.
- **No verification beats it** for consistent players. Whatever the
  selection and acceptance rules, a random other player is accepted with
  probability at least $(1-\beta)^2\cdot 3!/N!$, where $\beta$ is the
  false-reject rate (§4.1).
- **A session of $T$ picks certifies at most $2T$ bits** when its quads are
  chosen without looking at the claimed player's template (§4.2). Noise and
  shared taste lower the rate further: a pick is worth at most how much the
  population disagrees on it, minus how much the player disagrees with
  themself (§4.3).
- **Shared taste** makes entropy grow linearly in $N$ instead of as
  $N\log_2 N$. In a one-parameter model where consensus neighbours are
  swapped a third of the time, $N = 20$ holds 33 bits instead of 58, and a
  guesser who plays the consensus faces only 17 (§5).
- **Learning the template** takes at least $H_{\max}/2$ picks. Adaptive
  quads come within about 1.2× of that; uniform quads need about
  $1.1\binom N4$ (§6).

## 1. Setting

| Symbol | Meaning |
|---|---|
| $N$ | images in the set |
| $Q$ | a quad, $\lvert Q\rvert = 4$ |
| $\sigma$ | a player's ranking of the set |
| $[\sigma]$ | its observable part (§2) |
| $\pi$ | the population's distribution over observable rankings |
| $T$ | picks in a verification session |
| $\alpha$, $\beta$ | false-accept and false-reject rates |
| $b = \log_2(1/\alpha)$ | the strength of a verification, in bits |
| $\kappa$ | a player's consistency score, [scoring.md](scoring.md) §7 |

Authentication has two phases. *Enrolment* learns a player's template from
their picks. *Verification* runs a session for a claimed player A and
accepts or rejects. Its strength $b$ reads like a password's entropy: an
impostor gets in with probability $2^{-b}$.

Two impostors:

- **zero-effort**: another member of the population, playing their own
  taste;
- **guessing**: knows $\pi$ and the verifier's algorithm, sees the quads
  served, but does not know A.

A *consistent* player always picks the quad's top image under a fixed
ranking $\sigma$, as in scoring.md §4.5. This is the best case for
authentication. §4.3 drops it.

*Assumption.* Players' choices come from a ranking, perhaps with noise (the
strength model of scoring.md §3.1 is one example). §2 says what is lost if
they do not.

## 2. What a pick can reveal

A pick shows the top image of the quad. Call two rankings *equivalent* when
they pick the same image from every quad.

**Claim.** For $N \ge 4$, two rankings are equivalent exactly when they
hold the same images, in the same order, in their top $N-3$ places. There
are $N!/3!$ equivalence classes.

*Proof.* Suppose the top $N-3$ places agree. A quad has four images and the
bottom three places hold only three, so every quad contains a top-$(N-3)$
image, and its pick is the highest of those, which both rankings place
alike. Conversely, suppose the rankings first differ at place $k \le N-3$,
with $a$ in one and $b \ne a$ in the other. Places $k$ to $N$ hold
$N-k+1 \ge 4$ images, $a$ and $b$ among them. A quad of $a$, $b$ and two
more of those gets $a$ from one ranking and $b$ from the other. The classes
are the ordered top-$(N-3)$ sequences, $N(N-1)\cdots 4 = N!/3!$ of them. ∎

Enumeration agrees: 4, 20, 120 and 840 distinct choice patterns at $N$ = 4
to 7. The bottom three are never ordered, as scoring.md §6 found. The class
$[\sigma]$ is everything about $\sigma$ the game can ever use.

**Beyond rankings.** A choice pattern need not come from a ranking: there
are $4^{\binom N4}$ ways to answer every quad, $2\binom N4$ bits (420 at
$N = 10$). This document assumes that capacity is out of reach: a person is
unlikely to repeat answers with no order behind them, and the pairwise
forecast of scoring.md §3 cannot represent them, because a pair's counts
pool rounds from different quads.

## 3. The maximum entropy

The secret is $[\sigma]$, so its entropy across the population, $H(\pi)$,
bounds how well the game can tell players apart. A distribution over $K$
outcomes has $H \le \log_2 K$, with equality exactly when it is uniform
(Gibbs' inequality). With $K = N!/3!$:

$$
H(\pi) \;\le\; H_{\max}(N) = \log_2\frac{N!}{3!} = \sum_{m=4}^{N}\log_2 m\quad\text{bits}.
$$

The sum reads place by place: the top image is one of $N$, the next one of
$N-1$, down to one of 4 at place $N-3$. Equality needs a population in which
every observable ranking is equally common, as when each player's ranking
is uniformly random and independent of everyone else's. Stirling's formula,

$$
H_{\max}(N) \approx N\log_2 N - N\log_2 e + \tfrac12\log_2(2\pi N) - \log_2 6,
$$

is within 0.03 bits from $N = 4$ on.

| $N$ | 4 | 5 | 8 | 10 | 12 | 16 | 20 | 25 | 30 | 50 | 100 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| $H_{\max}$ (bits) | 2 | 4.3 | 12.7 | 19.2 | 26.3 | 41.7 | 58.5 | 81.1 | 105.1 | 211.6 | 522.2 |

| target (bits) | 13.3 (a random 4-digit PIN) | 20 | 32 | 40 | 64 | 80 | 128 |
|---|---|---|---|---|---|---|---|
| smallest $N$ | 9 | 11 | 14 | 16 | 22 | 25 | 35 |

**Other entropies.** Shannon entropy is an average. Authentication cares
about the worst case:

- *min-entropy* $H_\infty(\pi) = -\log_2 \max_c \pi(c)$: a guessing
  impostor's best single guess is right with probability $2^{-H_\infty}$;
- *collision entropy* $H_2(\pi) = -\log_2\sum_c \pi(c)^2$: two random
  players share an observable ranking with probability $2^{-H_2}$.

Both are Rényi entropies. $H_\infty \le H_2 \le H \le H_{\max}$, and all four
are equal for uniform $\pi$. The maximum-entropy population is also the
hardest to guess.

## 4. What a verification can certify

### 4.1 The ceiling for any verification

**Claim.** Let players be consistent. Take any verifier: any quad-selection
rule (it may use the claimed template, the session so far and server
randomness) and any acceptance rule, with false-reject rate $\beta$. Then

$$
\alpha_{\text{guess}} \;\ge\; \alpha_0 \;\ge\; (1-\beta)^2\,\frac{3!}{N!},
\qquad
b \;\le\; H_{\max}(N) + 2\log_2\frac{1}{1-\beta},
$$

where $\alpha_0$ and $\alpha_{\text{guess}}$ are the false-accept rates
against zero-effort and guessing impostors. The excess term is 0.03 bits at
$\beta = 1\%$.

*Proof.* Two players of the same class pick the same image from every
quad. For the same server randomness they produce the same session and get
the same verdict, whatever the verifier does. A zero-effort impostor B
claiming to be A is therefore accepted at least when $[\sigma_B] =
[\sigma_A]$ and A would have been. Let $g_c$ be the chance that a genuine
player of class $c$ is accepted, so $\sum_c \pi(c)\,g_c = 1-\beta$. Then

$$
\alpha_0 \;\ge\; \sum_c \pi(c)^2 g_c
\;\ge\; \frac{\big(\sum_c \pi(c)\,g_c\big)^2}{\sum_c g_c}
\;\ge\; \frac{(1-\beta)^2}{N!/3!},
$$

the middle step by Cauchy–Schwarz, the last because each $g_c \le 1$ and
there are at most $N!/3!$ classes. A guessing impostor can play like a
random member of the population, so $\alpha_{\text{guess}} \ge \alpha_0$. ∎

With $\beta = 0$ the bounds sharpen to $\alpha_0 \ge 2^{-H_2(\pi)}$ and
$\alpha_{\text{guess}} \ge 2^{-H_\infty(\pi)}$: the guesser plays the
commonest ranking.

### 4.2 Two bits per pick

**Claim.** Let players be consistent, and let the verifier choose quads
without looking at the claimed template: from the session so far, server
randomness and public information such as population statistics. Call this
*template-blind*; uniform selection is one such rule. Then a $T$-pick
session has

$$
\alpha_0 \;\ge\; \frac{(1-\beta)^2}{4^T},
\qquad
b \;\le\; \min\big(2T,\ H_{\max}(N)\big) + 2\log_2\frac{1}{1-\beta}.
$$

*Proof.* Fix the server randomness. Each quad then depends only on the
picks before it, by the same rule for every player, so a session is fixed
by its sequence of picks, and there are at most $4^T$ sequences. An
impostor whose sequence matches the claimed player's gets the claimed
player's verdict. Repeat §4.1 with sequences in place of classes, then
average over the server randomness. ∎

This caps what a session can certify, not single increments: scoring.md §8
rightly lets one pick's value exceed 2 bits. But if a §8 threshold of $b$
bits really holds its false-accept rate to $2^{-b}$, it accepts genuine
players with probability at most $2^{T - b/2}$. Above $2T + 2$ bits, it
rejects most of them.

**Template-aware selection.** A verifier that picks quads from the claimed
template is not covered, and against a zero-effort impostor it does
better. Say A ranks $x_1$ over $x_2$, and $x_2$ over $a, b, c, d, e$.
Serve $\{x_1, x_2, a, b\}$ and then $\{x_2, c, d, e\}$. A random ranking
picks $x_1$ and then $x_2$ with probability $\frac17\cdot\frac14 =
\frac1{28}$: $x_1$ must top all seven, then $x_2$ the last three. That is
4.8 bits from two picks. Chaining quads of A's places $k$ to $k+3$, for
$k = 1, \dots, N-3$, pins down the whole observable ranking: $H_{\max}$
bits in $N-3$ picks.

The quads give the template away. In the chain, $Q_1$ is A's top four, and
each later quad's newcomer is its lowest image. A guessing impostor gets
$Q_1$ right with probability ¼, $Q_2$ with ⅓, $Q_3$ with ½, and every quad
after that for certain: 4.6 bits, however large $N$ is. Whether some
template-aware rule beats 2 bits per pick against an impostor who sees the
quads is open. Verify template-blind.

### 4.3 Noisy players and shared taste

Real players are not consistent. Let each pick be random given the player
and the quad, independently from round to round, and let $q_A(\cdot \mid Q)$
be player A's choice distribution on $Q$. Selection is template-blind.

**Claim.** Averaged over the claimed player, with $\beta$ bounding every
player's false-reject rate,

$$
\mathbb{E}_A\, b_A \;\le\; \frac{I + 1}{1-\beta},
\qquad
I \;\le\; \sum_{t=1}^{T} \Big( H(x_t \mid Q_t) - \mathbb{E}_A\, H\big(q_A(\cdot \mid Q_t)\big) \Big),
$$

where $b_A$ is the strength of verifying A against zero-effort impostors and
$H(x_t \mid Q_t) \le 2$ is the entropy of a random player's pick given only
the quad. Under uniform selection, the mean over quads of
$H(q_A(\cdot \mid Q))$ is $2(1-\kappa_A)$ by the definition of $\kappa$, so

$$
I \;\le\; T\,\big(\bar H_Q - 2(1-\bar\kappa)\big) \;\le\; 2\bar\kappa\,T,
$$

with $\bar H_Q$ the population's pick entropy averaged over quads and
$\bar\kappa$ the population's mean consistency.

*Proof.* With template-blind selection, an impostor's session distribution
$P_0$ is the same whichever player is claimed: the population mixture of
the players' session distributions $P_A$. The verdict is a yes/no function
of the session, and processing cannot raise relative entropy, so

$$
D(P_A \,\|\, P_0) \;\ge\; d(1-\beta_A \,\|\, \alpha_A)
\;\ge\; (1-\beta_A)\log_2\frac{1}{\alpha_A} - 1,
$$

where $d(u\|v) = u\log_2\frac uv + (1-u)\log_2\frac{1-u}{1-v} \ge
u\log_2\frac1v - h(u)$ is the relative entropy of two coins and the binary
entropy $h \le 1$. Averaged over A, $D(P_A\|P_0)$ is the mutual information
$I$ between the player and the session. By the chain rule, $I$ is the sum
over rounds of what each adds. A quad adds nothing, since it depends only
on the past. A pick adds its entropy given the past, at most
$H(x_t \mid Q_t)$, minus its entropy given the player as well,
$H(q_A(\cdot \mid Q_t))$. ∎

A pick is worth at most how much the population disagrees on its quad,
minus how much the player disagrees with themself. Two cases:

- **Noise.** With no shared taste, $\bar H_Q = 2$. A population that slips
  at $e$ = 0.02, 0.05, 0.1, 0.2 (scoring.md §7's slip model) then gets at
  most 1.83, 1.63, 1.37, 0.96 bits per pick. At $e = 0.05$ and $\beta$ near
  0, an average strength of 13.3 bits takes at least 8 picks, and 20 bits
  at least 12.
- **Shared taste.** With consistent players, the rate is at most
  $\bar H_Q$, below 2 bits whenever people agree. §5 gives values.

For consistent players the session is a function of $[\sigma]$, so also
$I \le H(\pi)$. A noisy player's identity is more than a ranking: two
players with one order and different noise differ. So §3's total does not
bind them; the rate does.

The bound is on the average over players. An unusual player can be
verified faster than this.

## 5. Shared taste

A uniform $\pi$ assumes no two people agree more than chance. Real
populations share taste, which lowers all three entropies. By how much has
to be measured. The model below only shows the shape; it is not fitted to
anything.

**The Mallows model.** Rankings scatter around a consensus $\sigma_0$:
$\pi(\sigma) \propto q^{d(\sigma, \sigma_0)}$, where $d$ counts the pairs
ordered against the consensus and $0 < q \le 1$. At $q = 1$ every ranking is
equally likely; as $q \to 0$ everyone agrees. Two consensus neighbours are
swapped with probability exactly $q/(1+q)$. Swapping them changes $d$ by 1,
which pairs off the rankings.

The model can be sampled from the top down (Fligner and Verducci). At each
place, skip $r$ of the remaining images in consensus order and take the
next, with probability proportional to $q^r$; the skips add up to $d$. The
choices at different places are independent, and the observable ranking is
the first $N-3$ of them, so

$$
H(\pi) = \sum_{m=4}^{N} H_m(q),
\qquad
H_\infty(\pi) = \sum_{m=4}^{N} \log_2\frac{1-q^m}{1-q},
$$

with $H_m(q)$ the entropy of a geometric distribution cut off at $m$
values. At $q = 1$ both sums are $H_{\max}$. For $q < 1$ each term tends to
a constant as $m$ grows: $h(q)/(1-q)$ for $H$, $\log_2\frac1{1-q}$ for
$H_\infty$. **Any fixed degree of shared taste makes the entropy grow
linearly in $N$, not as $N\log_2 N$.**

| $q$ | neighbours swapped | $H$, $N=20$ | $H_\infty$, $N=20$ | $H$, $N=50$ | $H_\infty$, $N=50$ | $H$ per place, large $N$ |
|---|---|---|---|---|---|---|
| 1 | 0.50 | 58.5 | 58.5 | 211.6 | 211.6 | $\log_2 m$ |
| 0.9 | 0.47 | 56.7 | 46.1 | 191.0 | 144.2 | 4.69 |
| 0.7 | 0.41 | 45.8 | 28.3 | 133.9 | 80.4 | 2.94 |
| 0.5 | 0.33 | 33.2 | 16.8 | 93.2 | 46.8 | 2.00 |
| 0.3 | 0.23 | 21.3 | 8.7 | 59.1 | 24.2 | 1.26 |
| 0.1 | 0.09 | 8.9 | 2.6 | 24.5 | 7.1 | 0.52 |

- **Min-entropy falls fastest.** The guessing impostor plays the consensus.
  At $q = 0.5$ and $N = 20$ that guess is right with probability
  $2^{-16.8}$, against $2^{-58.5}$ in the maximum-entropy population.
- **Per pick.** Simulated at $N = 20$, a uniformly drawn quad's pick carries
  $\bar H_Q$ = 1.87, 1.18 and 0.66 bits at $q$ = 0.9, 0.7 and 0.5 (§4.3). A
  quad of four consensus neighbours carries 1.99, 1.89 and 1.64 bits; one
  spread across the consensus, 1.78, 0.83 and 0.25. Identity-discriminating
  selection (requirements.md, *Selection*) means serving quads the
  population disagrees on, and those are quads of images close in the
  consensus.

## 6. Picks to learn the template

Enrolment must single out the player's class among $N!/3!$. A pick has 4
outcomes, so learning the full observable ranking takes at least

$$
T_{\text{enrol}} \;\ge\; \frac{H_{\max}(N)}{2} \;\approx\; \tfrac12\,N\log_2 N
$$

picks under any selection rule, in the worst case and on average over a
maximum-entropy population. It is the information-theoretic sorting bound
(Knuth) with four outcomes per query instead of two.

**Adaptive selection** comes close. A tournament rule serves four images
not yet known to be beaten, preferring those with the fewest known wins,
and fills a short quad with images already known to be beaten. Simulated
on consistent players:

| $N$ | 10 | 20 | 50 | 100 |
|---|---|---|---|---|
| lower bound $H_{\max}/2$ | 9.6 | 29.2 | 105.8 | 261.1 |
| tournament, mean picks | 11.7 | 35.9 | 125.9 | 304.3 |

That is about 1.2× the bound.

**Uniform selection** does not come close. The order of places $N-3$ and
$N-2$ shows only in the quad of the bottom four, which uniform selection
serves once in $\binom N4$ picks. Simulated, it takes about $1.1\binom N4$
picks to learn the full ranking: 242 at $N = 10$, 5 307 at $N = 20$. What
uniform selection costs the pairwise scorer is in scoring.md §4.5.

Verification does not need the whole template. Under uniform quads the pick
is the player's place-$k$ image with probability
$\binom{N-k}{3}\big/\binom N4$, so at $N = 20$ 72% of picks come from the
top five. Enrolment for uniform verification can stop short of the bottom.

## 7. Consequences and limits

- **$H_{\max}$ is a ceiling.** Quote a strength only after measuring $\pi$
  on real players. §5 suggests real entropy grows linearly in $N$.
- **One large set holds more than several small ones.** One set of 50
  holds 211.6 bits; five sets of 10 hold at most 96, and only if tastes in
  different sets are independent. The large set costs more enrolment picks
  (§6).
- **Verification length.** $b$ bits take at least $b/2$ picks from
  consistent players, more with noise or shared taste (§4.3).
- **Select verification quads template-blind.** Quads chosen from the
  claimed template can disclose it (§4.2).
- **The secret is on show.** Anyone who sees a player's picks (over the
  shoulder, from a leaked round log, from a recorded session) learns the
  template, and a bot can replay it (scoring.md §9, *Consistency is not
  sincerity*). The round log is as sensitive as a password file; this bears
  on the privacy open question in requirements.md.
- **No revocation within a set.** A player cannot choose a new taste. A
  leaked template is revoked by enrolling on a fresh image set, assuming
  tastes in different sets are independent.
- **Taste drifts.** A template ages and false rejects rise. Re-enrol, or
  discount old picks (scoring.md §5).
- **Many attempts.** The bounds are per claimed player and per attempt. $M$
  impostor attempts succeed with probability up to $M\alpha$ (scoring.md
  §9, *Multiple testing*).

## References

- Cover, T. M., & Thomas, J. A. (2006). *Elements of Information Theory*, 2nd ed. Wiley.
- Fligner, M. A., & Verducci, J. S. (1986). Distance based ranking models. *Journal of the Royal Statistical Society: Series B*, 48(3), 359–369.
- Knuth, D. E. (1998). *The Art of Computer Programming, Vol. 3: Sorting and Searching*, 2nd ed. Addison-Wesley.
- Mallows, C. L. (1957). Non-null ranking models. I. *Biometrika*, 44(1/2), 114–130.
- Rényi, A. (1961). On measures of entropy and information. *Proceedings of the Fourth Berkeley Symposium on Mathematical Statistics and Probability*, 1, 547–561.
