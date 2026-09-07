import {
  defaultBasicAttack,
  resolveTurn as resolveTurnStrict,
  type ResolveTurnInput,
} from "@kshiai/shared";

type TestResolveTurnInput = Omit<
  ResolveTurnInput,
  "sideABasicAttack" | "sideBBasicAttack"
> & Partial<Pick<
  ResolveTurnInput,
  "sideABasicAttack" | "sideBBasicAttack"
>>;

export function resolveTurn(input: TestResolveTurnInput) {
  return resolveTurnStrict({
    ...input,
    sideABasicAttack: input.sideABasicAttack ?? defaultBasicAttack(),
    sideBBasicAttack: input.sideBBasicAttack ?? defaultBasicAttack(),
  });
}
