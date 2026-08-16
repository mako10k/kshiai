export const e2eGuiBattleId = "btl_e2e_gui";

export const e2eGuiMe = {
  user: {
    id: "usr_e2e_gui",
    username: "e2e-observer",
    displayName: "観測者",
    isAdmin: false,
  },
};

export const e2eGuiBattle = {
  battle: {
    id: e2eGuiBattleId,
    status: "active",
    turn: 1,
    turnLimit: 20,
    sideA: {
      characterId: "chr_e2e_dialogue_nagi",
      displayName: "ナギ",
      canFight: true,
      imageUrl: null,
    },
    sideB: {
      characterId: "chr_e2e_dialogue_gaku",
      displayName: "ガク",
      canFight: true,
      imageUrl: null,
    },
    policies: [],
    policySummary: "",
    opponentPolicySummary: "",
    scene: "雨の路地",
    situationNotes: "",
    battlefield: {
      sourcePresetId: "bfp_e2e_dialogue_rainy_alley",
      displayName: "雨の路地",
      category: "urban",
      categoryLabel: "市街",
      scene: "雨の路地",
      terrain: "濡れた石畳",
      obstacles: ["積み荷"],
      conditions: ["雨"],
      narrativeSetup: "狭い路地に雨が落ちる",
      imageUrl: null,
    },
    objectStates: [
      {
        label: "木箱",
        kind: "object",
        active: true,
        presence: "present",
        states: ["閉じている"],
        placementSummary: "路地の奥",
      },
    ],
    pendingEffects: [],
    log: [
      {
        turn: 0,
        narrator: ["開幕。雨が石畳を叩く。"],
        speeches: [],
      },
    ],
    receipts: [],
    availableActions: [],
    winnerSide: null,
    finishReason: null,
    prologuePending: false,
    aftermathPending: false,
  },
};

export const e2eGuiNarration = {
  battleId: e2eGuiBattleId,
  entries: [],
  cursor: null,
  reset: false,
};
