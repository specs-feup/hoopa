import { ExtendedTaskGraphAPI } from "extended-task-graph/ExtendedTaskGraphAPI";

const api = new ExtendedTaskGraphAPI();
const etg = api.runTaskGraphGenerationFlow();

const task = etg?.getTaskById("task1");
