import { Type, type Static } from "@sinclair/typebox";

export const ApiEventSchema = Type.Union([
  Type.Object({
    type: Type.Literal("announcement"),
    announcement: Type.Object({ id: Type.Number(), title: Type.String(), content: Type.Union([Type.String(), Type.Null()]) }),
  }),
  Type.Object({
    type: Type.Literal("request"),
    request: Type.Object({
      id: Type.Number(),
      title: Type.String(),
      body: Type.Union([Type.String(), Type.Null()]),
      app: Type.Union([Type.String(), Type.Null()]),
      status: Type.String(),
    }),
  }),
]);
export type ApiEvent = Static<typeof ApiEventSchema>;
