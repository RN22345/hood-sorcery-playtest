// B8 Block corner (P1 + P2): the first corner is "The Block", fed by the Vein. Corners scores Rep, so the
// Block's heal reads as +1 Rep a round for its holder (playtest guess, modes/corners.md).
export default {
  id: "blockCorner",
  init(st) {
    const z = st.zones[0];
    z.name = "The Block"; z.rich = true; z.block = true;
  },
  zoneRep: (st, ctx, z) => (z.block ? ctx.p.blockRep ?? 1 : 0),
};
