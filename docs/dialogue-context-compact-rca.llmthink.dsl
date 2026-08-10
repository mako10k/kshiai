domain KshiaiCompactDialogueRca:
  description "Root-cause analysis of compact dialogue-context production observations"

problem RCA1:
  |
    The first compact production observation converged both characters on one
    threat phrase. The correction must preserve character-driven recurrence
    while avoiding a phrase ban, prose validator, retry loop, or mechanic rule.

evidence OBS1:
  |
    Run 31352489499 on v0.14.0 battle btl_39ad0fa80d94b23fc1db08f5 finished
    in 11 advances with 21 public lines, 15 unique lines, six duplicates, and
    a three-line repeat run. At turns 8 and 9 Nagi also emitted Gaku's phrase.

evidence OBS2:
  |
    Both compact lanes fulfilled with correct own-character identities and
    correctly side-labelled result packets. A/B mechanics, profile, and schema
    swaps are therefore excluded as the primary cause.

evidence OBS3:
  |
    At turn 9 A selfResult includes A's own prior utterance and B
    counterpartResult includes hearing it. buildTurnObservationPacket admits
    every newly-added percept to result fields, while utterances also persist
    in conversation history.

evidence OBS4:
  |
    Compact inputs duplicate recent exchange under compactRecentExchange and
    conversation.recentExchange, duplicate anchoredExchange at two paths, and
    retain lastSpeech plus DialogueThreadState in prior psyche state.

evidence OBS5:
  |
    The compact psyche prompt permits reiterate but lacks the legacy contract's
    explicit expected-versus-observed-impact appraisal. B repeatedly chose
    reiterate and A's brief then selected phrase mirroring; expression executed
    those valid briefs faithfully.

decision RC1 based_on RCA1, OBS1, OBS2, OBS3:
  |
    The root cause is category attribution: a committed utterance becomes both
    a fresh result and conversation continuity, so lexical persistence appears
    as a new event and can echo across speakers despite correct side labels.

decision RC2 based_on RC1, OBS4:
  |
    Correlated duplicate context amplifies the lexical salience of that phrase.
    This is prompt topology, not an intentional character recurrence.

decision RC3 based_on RC1, RC2, OBS5:
  |
    ExpressionBrief needs an appraisal-grounded semantic relation move. It may
    retain reiteration as a personality choice, but it must not preserve or
    require a lexical continuation.

decision FIX_DIRECTION based_on RC1, RC2, RC3:
  |
    Keep utterance perception in exactly one ordered conversation thread and
    exclude it from TurnObservationPacket. Send each recent exchange and chosen
    anchor once. Strengthen the compact psyche contract around expected impact,
    observed impact, and a semantic public aim; deterministic code validates
    only schema, category separation, ownership, and cardinality.

evidence OBS6:
  |
    Run 31354794388 on v0.14.1 battle btl_b407a7ef4fc08af9638e3cb5 finished
    in 11 advances with 21 public lines, 17 unique lines, four duplicates, and
    a three-line repeat run by Gaku. Nagi then counted each recurrence, so the
    conversation converged on the repetition itself. Compact mode was disabled
    immediately after this protected observation.

evidence OBS7:
  |
    The v0.14.1 trace has correct A/B ownership, one conversation exchange
    path, and utterances absent from fresh result packets. However every compact
    deep-psyche delta updated only dialogueThread; interior.speechAppraisal
    remained its initial blank values. ExpressionBrief therefore described a
    semantic move but was not joined to the character's persisted assessment of
    whether their preceding social move worked.

decision RC4 based_on OBS6, OBS7:
  |
    Thread separation removed the original attribution and alias defects but
    did not complete the social feedback loop. The remaining cause is an
    under-specified compact deep-psyche output: an optional appraisal permits a
    stable unresolved topic to repeatedly regenerate its familiar wording.

decision FIX_DIRECTION_2 based_on RC4:
  |
    Compact deep psyche must emit a typed speechAppraisal on every turn, with
    expected impact, observed interpersonal impact, and a next semantic
    approach. Expression receives that private appraisal and realizes it only
    through observable wording or behavior. The schema enforces its presence,
    not any phrase or outcome; reiteration remains a character-authored option
    only when its protective stance and present result make it meaningful.

decision VALIDATION_DIRECTION based_on FIX_DIRECTION, FIX_DIRECTION_2:
  |
    Add deterministic projection and input-shape tests, then require six fresh
    isolated staging battles and three protected production observations. Quality
    metrics diagnose release acceptance only and never alter a running battle.
