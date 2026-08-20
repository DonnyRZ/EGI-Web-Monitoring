import assert from "node:assert/strict";
import test from "node:test";
import { GoneException } from "@nestjs/common";
import { TasksController } from "./tasks.controller";

test("legacy task creation is explicitly disabled without writing data", () => {
  const controller = new TasksController({} as never);

  assert.throws(
    () => controller.createDisabled({} as never),
    (error: unknown) =>
      error instanceof GoneException &&
      error.message.includes("Legacy Task creation is disabled"),
  );
});
