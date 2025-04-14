# Actions

Actions are not to be confused with [events](../events/README.md).

| Action                     | Event                          |
| -------------------------- | ------------------------------ |
| caused by user interaction | caused by user interaction     |
| must have a target         | can have a target              |
| cannot stop propagation    | propagation stops when handled |
| can be undone              | cannot be undone               |
| triggers "real" code       | can trigger multiple *actions* |

The general data flow looks like the following:

- start: DOM Event (ex. from `ContentEditableInputCapture`)
- Event converted to **request**
- Request passed to elements in the context, finding the closest element that will accept the request
- If the request is accepted, the request becomes an **action**
- The action is logged into the `UndoLog`, and then performed
- Finally, the action's *target* executes the action, causing something to happen

## Purpose

The main purpose of actions is to provide a method of undoing actions done by the user.

For example, if the user removes an instruction line, this creates an `RemoveInstructionAction` that will remove the instruction line.

When we want to undo this action, `UndoLog` will find the `RemoveInstructionAction`, notice that it is an instance of `UndoableAction`, and call `action.inverse().perform()`.

## Properties

- Actions are deterministic and reversable
  - deterministic means the action will always "do the same thing"
  - reversable means that there is another action such that performing the action and then the reverse action will not change the state.
- Actions are handled by their target. Actions must only have targets that can accept them.
- Are usually defined in in the same file as their target
- Propgates though `ActionBus`
  - Parent action busses will recieve all actions from children
