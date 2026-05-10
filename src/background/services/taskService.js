import { getStorage, setStorage } from './storageService.js';
import { broadcastMessage } from './notificationService.js';

export async function handleMessage(type, message) {
  switch (type) {
    case 'GET_TASKS':
      return getTasks();
    case 'CREATE_TASK':
      return createTask(message);
    case 'UPDATE_TASK':
      return updateTask(message);
    case 'DELETE_TASK':
      return deleteTask(message);
    default:
      return null;
  }
}

async function getTasks() {
  const { tasks } = await getStorage('tasks') || {};
  return { tasks: tasks || [] };
}

async function createTask(message) {
  const { tasks: existing } = await getStorage('tasks') || {};
  const taskList = existing || [];
  const newTask = {
    id: `task_${Date.now()}`,
    name: message.name,
    description: message.description || '',
    status: 'active', // active | completed | archived
    linkedIntents: [],
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  taskList.push(newTask);
  await setStorage({ tasks: taskList });
  broadcastMessage({ type: 'TASKS_UPDATED', tasks: taskList });
  return { success: true, task: newTask };
}

async function updateTask(message) {
  const { tasks: all } = await getStorage('tasks') || {};
  const taskArr = all || [];
  const idx = taskArr.findIndex(t => t.id === message.taskId);
  if (idx >= 0) {
    taskArr[idx] = { ...taskArr[idx], ...message.updates };
    await setStorage({ tasks: taskArr });
    broadcastMessage({ type: 'TASKS_UPDATED', tasks: taskArr });
    return { success: true };
  }
  return { error: 'Task not found' };
}

async function deleteTask(message) {
  const { tasks: tAll } = await getStorage('tasks') || {};
  const filtered = (tAll || []).filter(t => t.id !== message.taskId);
  await setStorage({ tasks: filtered });
  broadcastMessage({ type: 'TASKS_UPDATED', tasks: filtered });
  return { success: true };
}
