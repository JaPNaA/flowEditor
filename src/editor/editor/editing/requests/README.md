# Requests

Requests are not to be confused with actions -- requests trigger actions.

Requests behave similarly to JavaScript DOM events.

See a comparison in the [Actions README](../actions/README.md).

## Purpose

The same user interaction can cause different things to happen based on the context.

For example, consider when the user presses 'Enter.'

Consider when the user's cursor (`|`) is in the following position:

1. On `NewInstruction`
```
|Press shortcut or hold shift and type to search...
```

2. On some regular single line instruction
```
Test says: "this is a test|"
```

3. On a composite instruction

```
Create Graphic: myGraphic
  source: myGraphic.png|
```

The following actions that are dispatched when 'Enter' is pressed for each of the scenarios are as follows:

1. A series of `RemoveInstructionAction`s to remove the instructions below the `NewInstruction`, a `AddInstructionGroupAction`, and then a series of `AddInstructionAction`s add the removed instruction back into the newly created group
2. A `AddInstructionAction` to insert a `NewInstruction` below the current instruction
3. A `AddInstructionAction` to insert a `NewInstruction`, which is a child of the CreateGraphic instruction

---

Requests are passed to objects in the current context to let the context decide what to do in each request.

## Properties

- requests start at the target, and propagate up to parent ('next') request accepter
- requests use `RequestAccepter` to propagate requests. There can only be one handler per accepter.
