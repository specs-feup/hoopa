import { TaskGraph } from "extended-task-graph/TaskGraph";
import { ConcreteTask } from "../../../extended-task-graph/dist/src/taskgraph/tasks/ConcreteTask.js";

export class Cluster {
    private etg: TaskGraph;
    private tasks: ConcreteTask[] = [];
    private currentTopTask: ConcreteTask | null = null;

    constructor(etg: TaskGraph) {
        this.etg = etg;
    }

    addTask(task: ConcreteTask): boolean {
        if (this.tasks.length == 0) {
            this.tasks.push(task);
            this.currentTopTask = task;
            return true;
        }
        return false;
    }

    getTasks(): ConcreteTask[] {
        return this.tasks;
    }

    getTopTask(): ConcreteTask | null {
        return this.currentTopTask;
    }
}