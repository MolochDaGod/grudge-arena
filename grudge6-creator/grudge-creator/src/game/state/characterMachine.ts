/**
 * characterMachine — XState v5 replacement for the imperative CharacterFSM.
 *
 * Why a machine: declarative transitions + interrupt rules that are easy to
 * inspect (xstate-inspector), test in isolation, and extend (e.g. adding
 * combo windows, hit-stun timers, or state-scoped cooldowns later).
 *
 * Why this wrapper class: ToonCharacter and the rest of the game call
 * `fsm.setState('walk')`, `fsm.update(dt)`, `fsm.state`, `fsm.isIn(...)` —
 * we keep that exact surface so nothing downstream changes.  The XState
 * actor lives behind it.
 *
 * Per-state ENTRY logic (anim.crossFade / crossFadeSync / clip fallbacks)
 * mirrors the original CharacterFSM 1:1 so animation behaviour is unchanged.
 */
import { setup, assign, createActor, type ActorRefFrom } from 'xstate';
import type { AnimationSystem } from '../AnimationSystem';

// ── State names — superset matches the old FSMStateName exactly ──────────────
export type FSMStateName =
  | 'idle'
  | 'walk'
  | 'run'
  | 'sprint'
  | 'attack'
  | 'attack_heavy'
  | 'shoot'
  | 'ranged_attack'
  | 'rifle_idle'
  | 'dodge'
  | 'dash'
  | 'block'
  | 'stun'
  | 'hit'
  | 'death'
  | 'phase_out'
  | 'phase_in'
  | 'jump'
  | 'fall';

const ALL_STATES: FSMStateName[] = [
  'idle','walk','run','sprint','attack','attack_heavy','shoot','ranged_attack',
  'rifle_idle','dodge','dash','block','stun','hit','death','phase_out','phase_in',
  'jump','fall',
];

// States that cannot be interrupted by the regular GO_TO event (only FORCE).
const NO_INTERRUPT = new Set<FSMStateName>(['death']);

// ── Per-state entry logic (mirrors CharacterFSM concrete classes) ────────────
//
// Each function plays / cross-fades the right clip on `anim`, branching on the
// state we came FROM so transitions feel right (sync-locked walk↔run, snappy
// attack overrides, etc.).  Adding a new state = add a case here + the state
// node below; no other changes needed.
function runEnterLogic(
  anim: AnimationSystem,
  to: FSMStateName,
  from: FSMStateName | null,
): void {
  const f = from ?? 'idle';

  switch (to) {
    case 'idle':
      if (f === 'walk' || f === 'run') anim.crossFadeSync(f, 'idle', 0.25);
      else if (f === 'attack' || f === 'attack_heavy' || f === 'hit' || f === 'dodge') anim.crossFade(f, 'idle', 0.2);
      else if (f === 'phase_in' || f === 'phase_out') anim.crossFade(f, 'idle', 0.3);
      else anim.to('idle', 0.3);
      return;

    case 'walk':
      if (f === 'idle' || f === 'run') anim.crossFadeSync(f, 'walk', 0.2);
      else anim.crossFade(f, 'walk', 0.2);
      return;

    case 'run': {
      const clip = anim.has('run') ? 'run' : 'walk';
      anim.crossFadeSync(f, clip, 0.2);
      return;
    }

    case 'sprint': {
      const clip = anim.has('sprint') ? 'sprint' : 'run';
      if (f === 'run' || f === 'walk' || f === 'idle') anim.crossFadeSync(f, clip, 0.15);
      else anim.crossFade(f, clip, 0.2);
      return;
    }

    case 'rifle_idle':
      anim.crossFade(f, 'rifle_idle', 0.25);
      return;

    case 'attack':
      anim.crossFade(f, 'attack', 0.05, false);
      return;

    case 'attack_heavy': {
      const clip = anim.has('attack_heavy') ? 'attack_heavy' : 'attack';
      anim.crossFade(f, clip, 0.05);
      return;
    }

    case 'shoot': {
      const clip = anim.has('shoot') ? 'shoot' : anim.has('ranged_attack') ? 'ranged_attack' : 'attack';
      anim.crossFade(f === 'idle' ? 'rifle_idle' : f, clip, 0.06);
      return;
    }

    case 'ranged_attack': {
      const clip = anim.has('ranged_attack') ? 'ranged_attack' : 'attack';
      anim.crossFade(f, clip, 0.08);
      return;
    }

    case 'dodge':
      anim.crossFade(f, 'dodge', 0.05);
      return;

    case 'dash': {
      const clip = anim.has('dash') ? 'dash' : anim.has('dodge') ? 'dodge' : 'run';
      anim.crossFade(f, clip, 0.04);
      return;
    }

    case 'block': {
      const clip = anim.has('block') ? 'block' : 'idle';
      anim.crossFade(f, clip, 0.12);
      return;
    }

    case 'stun': {
      const clip = anim.has('stun') ? 'stun' : anim.has('hit') ? 'hit' : 'idle';
      anim.crossFade(f, clip, 0.08, true);
      return;
    }

    case 'hit':
      anim.crossFade(f, 'hit', 0.04, true);
      return;

    case 'death':
      anim.crossFade(f, 'death', 0.15);
      return;

    case 'phase_out': {
      const clip = anim.has('phase_out') ? 'phase_out' : 'dodge';
      anim.crossFade(f, clip, 0.04);
      return;
    }

    case 'phase_in': {
      const clip = anim.has('phase_in') ? 'phase_in' : 'idle';
      anim.crossFade(f === 'idle' ? 'phase_out' : f, clip, 0.04);
      return;
    }

    case 'jump': {
      const clip = anim.has('jump') ? 'jump' : 'dodge';
      anim.crossFade(f, clip, 0.05);
      return;
    }

    case 'fall': {
      const clip = anim.has('fall') ? 'fall' : 'idle';
      anim.crossFade(f === 'idle' ? 'jump' : f, clip, 0.15);
      return;
    }
  }
}

// ── Machine definition ───────────────────────────────────────────────────────
//
// One leaf state per animation.  Two events:
//   - GO_TO  → respects NO_INTERRUPT (used by gameplay code)
//   - FORCE  → bypasses NO_INTERRUPT (used by death/respawn/server reconcile)
//
// `context.lastState` tracks the FROM-state so entry actions can pick the
// right cross-fade rule (walk→run sync vs. attack→idle hard fade, etc.).
//
// We build the `states` map programmatically so adding/removing names only
// requires touching the `FSMStateName` union + ALL_STATES + runEnterLogic.
interface MachineContext { lastState: FSMStateName }
type MachineEvent =
  | { type: 'GO_TO'; name: FSMStateName }
  | { type: 'FORCE'; name: FSMStateName };

function buildMachine(anim: AnimationSystem) {
  type StateNode = {
    on: Record<string, Array<{
      target: FSMStateName;
      guard?: 'canInterrupt';
      actions: Array<{ type: 'enterState'; params: { name: FSMStateName } } | { type: 'rememberLast' }>;
    }>>;
  };

  // Build per-state transition table: from any state, every other state name
  // is reachable via either GO_TO (guarded by canInterrupt) or FORCE (always).
  const states: Record<FSMStateName, StateNode> = {} as Record<FSMStateName, StateNode>;
  for (const from of ALL_STATES) {
    const on: StateNode['on'] = {};
    for (const to of ALL_STATES) {
      const goActions = [
        { type: 'enterState' as const, params: { name: to } },
        { type: 'rememberLast' as const },
      ];
      // GO_TO.<name> targets `to` from `from`, guarded by interrupt rules.
      // We use parameterized event name patterns so each leaf doesn't blow
      // up its `on` table size.  XState matches `GO_TO` by event payload via
      // a transition guard (see machineSend below).
      on[`GO_TO_${to}`] = [{ target: to, guard: 'canInterrupt', actions: goActions }];
      on[`FORCE_${to}`] = [{ target: to, actions: goActions }];
    }
    states[from] = { on };
  }

  return setup({
    types: {
      context: {} as MachineContext,
      events: {} as MachineEvent | { type: `GO_TO_${FSMStateName}` } | { type: `FORCE_${FSMStateName}` },
    },
    actions: {
      enterState: (_, params: { name: FSMStateName }) => {
        // We don't have read access to context inside actions in v5 typed
        // like this without contortion; instead, the machineSend wrapper
        // captures lastState BEFORE sending and we look it up via a ref.
        // (The actor's snapshot.context.lastState is the prior leaf's name.)
        const prev = currentLastStateRef.value;
        runEnterLogic(anim, params.name, prev);
      },
      rememberLast: assign(({ event }) => {
        const t = event.type;
        const m = /^(GO_TO|FORCE)_(.+)$/.exec(t);
        const name = (m ? m[2] : 'idle') as FSMStateName;
        currentLastStateRef.value = name;
        return { lastState: name };
      }),
    },
    guards: {
      canInterrupt: ({ context }) => !NO_INTERRUPT.has(context.lastState),
    },
  }).createMachine({
    id: 'character',
    initial: 'idle',
    context: { lastState: 'idle' },
    states: states as Record<FSMStateName, { on: Record<string, unknown> }>,
  });
}

// XState v5 actions don't get easy synchronous access to context via the
// inspector-friendly API we used; this tiny ref captures the most-recent
// state name so `enterState` can pass the correct FROM into runEnterLogic.
// One ref per CharacterMachine instance; closed over by buildMachine above
// only because it's recreated per machine.  See class below — we wire
// currentLastStateRef per-instance.
const currentLastStateRef = { value: 'idle' as FSMStateName };

// ── CharacterMachine — public API matches the old CharacterFSM exactly ───────
export class CharacterMachine {
  readonly anim: AnimationSystem;
  private actor: ActorRefFrom<ReturnType<typeof buildMachine>>;
  private _instanceLastRef = { value: 'idle' as FSMStateName };

  constructor(anim: AnimationSystem) {
    this.anim = anim;
    // Reset the module-level ref to this instance's tracker just-in-time.
    // (Multiple CharacterMachine instances would clash on the singleton ref;
    // for the player + enemies this is fine because each sends through this
    // class, which restores its own tracker on every send.)
    currentLastStateRef.value = 'idle';
    this.actor = createActor(buildMachine(anim));
    this.actor.start();
    // Initial entry — XState's `initial: 'idle'` runs the state node but our
    // entry actions are wired on transitions, not on state.entry, so we have
    // to fire the idle entry once manually for parity with old FSM.
    runEnterLogic(anim, 'idle', null);
  }

  /** Request a state transition. Honours interrupt rules (e.g. death sticks). */
  setState(name: FSMStateName) {
    if (this.state === name) return;
    currentLastStateRef.value = this._instanceLastRef.value;
    this.actor.send({ type: `GO_TO_${name}` } as { type: `GO_TO_${FSMStateName}` });
    this._instanceLastRef.value = this.state;
  }

  /** Force-set state, bypassing no-interrupt rules. */
  forceState(name: FSMStateName) {
    if (this.state === name) return;
    currentLastStateRef.value = this._instanceLastRef.value;
    this.actor.send({ type: `FORCE_${name}` } as { type: `FORCE_${FSMStateName}` });
    this._instanceLastRef.value = this.state;
  }

  /** Per-frame tick — currently a no-op (entry actions do all the work);
   *  kept on the API so callers don't need to remove their `fsm.update(dt)`
   *  calls and so we have a hook for future per-state timers. */
  update(_dt: number): void {
    /* reserved for state-scoped timers */
  }

  get state(): FSMStateName {
    return this.actor.getSnapshot().value as FSMStateName;
  }

  isIn(...names: FSMStateName[]): boolean {
    return names.includes(this.state);
  }

  /** Stop the underlying actor. Call from ToonCharacter.dispose() if needed. */
  stop() {
    this.actor.stop();
  }
}

// ── Back-compat alias ────────────────────────────────────────────────────────
// Existing code imports `CharacterFSM` from './CharacterFSM'; new code can
// migrate to `CharacterMachine` from this file at its own pace.  Both surface
// the same setState/forceState/update/state/isIn API.
export { CharacterMachine as CharacterFSM };
