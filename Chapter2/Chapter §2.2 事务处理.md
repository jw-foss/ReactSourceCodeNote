### §2.2 React的事务机制

#### § 2.2.1 事务的原理

```typescript
/**
 *                       wrappers (injected at creation time)
 *                                      +        +
 *                                      |        |
 *                    +-----------------|--------|--------------+
 *                    |                 v        |              |
 *                    |      +---------------+   |              |
 *                    |   +--|    wrapper1   |---|----+         |
 *                    |   |  +---------------+   v    |         |
 *                    |   |          +-------------+  |         |
 *                    |   |     +----|   wrapper2  |--------+   |
 *                    |   |     |    +-------------+  |     |   |
 *                    |   |     |                     |     |   |
 *                    |   v     v                     v     v   | wrapper
 *                    | +---+ +---+   +---------+   +---+ +---+ | invariants
 * perform(anyMethod) | |   | |   |   |         |   |   | |   | | maintained
 * +----------------->|-|---|-|---|-->|anyMethod|---|---|-|---|-|-------->
 *                    | |   | |   |   |         |   |   | |   | |
 *                    | |   | |   |   |         |   |   | |   | |
 *                    | |   | |   |   |         |   |   | |   | |
 *                    | +---+ +---+   +---------+   +---+ +---+ |
 *                    |  initialize                    close    |
 *                    +-----------------------------------------+
 */
```

​	这张图其实已经可以解释得很清楚了, React当中采用事务处理实际上就是采用Wrapper把要调用的方法包裹起来,  在调用方法之前, 先把包裹层(initialize)方法调用, 然后再到调用方法本身, 最后在结束时, 调用包裹层(close)方法, 在这里这个处理跟[underscore](http://underscorejs.org/)的`_.before`, `_.after`有些类似, 也可以理解为方法的**劫持调用**.下面 我们来具体看一看实现过程.

​	首先来看一看对Transaction类的接口类定义, 这里没有具体方法, 所以方法里面内容省略.(PS: 源文件当中并不是采取这种写法, 我通过这种写法来更简单一点介绍方法的具体用处).

```typescript
interface TransactionImpl {
  reinitializeTransaction: () => void; // 重置wrapper
  _isIntransaction: boolean; // transaction调度时标识符
  getTransactionWrappers: () => <Array>TransactionWrapper; // 拿到所有wrapper
  isInTransaction: () => boolean; // 得到transaction的标识符
  perform: <A, B, C, D, E, F, G, T: (a: A, b: B, c: C, d: D, e: E, f: F) => G>
    (method: T, scope: any, a: A, b: B, c: C, d: D, e: E, f: F) => G; // 事务调度
  initializeAll: (startIndex: number) => void; // 执行所有wrapper中的initialize方法
  closeAll: (startIndex: number) => void; // 执行所有wrapper中的close方法
}
```

​	`batchUpdate`的`transaction` 在**ReactDefaultBatchingStrategy.js**中实现了Transaction

```typescript
// 实际上类上是有部分实现的, 只不过我在这里没有写清楚具体实现过程, 把方法的用处写了出来
import TransactionImpl from 'Transaction';
// 定义Wrapper1号
var RESET_BATCHED_UPDATES = {
  initialize: emptyFunction,
  close: function() {
    ReactDefaultBatchingStrategy.isBatchingUpdates = false;
  },
};
// 定义Wrapper2号
var FLUSH_BATCHED_UPDATES = {
  initialize: emptyFunction,
  close: ReactUpdates.flushBatchedUpdates.bind(ReactUpdates),
};

var TRANSACTION_WRAPPERS = [FLUSH_BATCHED_UPDATES, RESET_BATCHED_UPDATES];

class ReactDefaultBatchingStrategyTransaction implements TransactionImpl {
  constructor() {
    this.reinitializeTransaction();
  }
  // 省略掉某些方法实现
  // 覆盖类方法
  getTransactionWrappers() {
    return TRANSACTION_WRAPPERS
  }
}
// 这个transaction的调用在下面👇
var transaction = new ReactDefaultBatchingStrategyTransaction();
// 当在调用这个transaction.perform方法的时候实际上是这样的: 
/**
 *
 *
 *            +----------------------+    +---------------------+        +----------+
 * perform -> |FLUSH_BATCHED_UPDATES.| -> |RSET_BATCHED_UPDATES.| -----> |  method  |
 *            |      initialize      |    |      initialize     |        |          |
 *            +----------------------+    +---------------------+        +----------+
 *                                                                            |
 *            +----------------------+    +----------------------+            |
 *            |RSET_BATCHED_UPDATES. |    |FLUSH_BATCHED_UPDATES.|            |
 *            |        close         |    |        close         | <----------+
 *            +----------------------+    +----------------------+
 */
```



​        [上一章](./Chapter §2.1 生命周期.md)我们了解到了`setState`方法实际上就是调用了`this.updater.enqueueSetState`, 那么我们来看看这个`enqueueSetState`方法到底是个什么东西, 在这背后到底发生了什么, 是道德的沦丧还是人性的扭曲.😂

首先关于`this.updater`这个对象是在组件挂载阶段的时候被赋值的

```typescript

// ReactReconcileTransaction
ReactReconcileTransaction.prototype.getUpdateQueue = function() {
  return ReactUpdateQueue;
} 

// ReactCompositeComponent.mountComponent

/**
 *  | M |
 *  | O |   transaction = new ReactReconcileTransaction();
 *  | U |
 *  | N |   updateQueue = transaction.getUpdateQueue();
 *  | T |
 *  | I |   this.updater = updateQueue;
 *  | N |
 *  | G |
 */

// setState
this.updater.enqueueSetState();
// 所以setState的调用(包含updater注入)
/**
 *  Mounting phase:  ReactComponent::updater(类成员)   <-------- ReactQueue;
 *                               | calling                             ^
 *                               v                                     |
 *  Updating phase:    enqueueSetState -----acctually belongs to-------+
 *
 *
```

`ReactUpdateQueue.enqueueSetState` 

```typescript
ReactUpdateQueue.enqueueSetState = function(publicInstance, partialState) {
	// ... 开发警告
  
    // 拿到实例
  	// 补充说一下此处的publicInstance 和 internalInstance的区别
  	// publicInstance 实际上是Component本身
    // internalInstance 实际上是被ReactCompositeComponentWrapper包装过的Component
  	// 比如有这样一个Component: App;
    // publicInstance instanceof ReactCompositeComponent
    // internalInstance instanceof ReactCompositeComponentWrapper
    var internalInstance = getInternalInstanceReadyForUpdate(
      publicInstance,
      'setState',
    );
	// 中断后续操作
    if (!internalInstance) {
      return;
    }
	// 推入internalInstance的_pendingStateQueue队列
    var queue =
      internalInstance._pendingStateQueue ||
      (internalInstance._pendingStateQueue = []);
    queue.push(partialState);
  
	// 推入一个全局队列等待执行
	// 把这个实例对象推入队列中, 会在后面直接拿到需要更新的对象获取这些对象上的
    // _pendingStateQueue调用.
    // 对ReactUpdates.enqueueUpdate调用
    enqueueUpdate(internalInstance);
}
// 首先来看一下getInternalInstanceReadyForUpdate方法
function getInternalInstanceReadyForUpdate(publicInstance, callerName) {
  // 从缓存里拿到实例
  var internalInstance = ReactInstanceMap.get(publicInstance);
  if (!internalInstance) {
    // ... 省略警告
    return null;
  }
  // ...省略警告
  return internalInstance;
}
// 再来看一看ReactUpdates.enqueueUpdate
var enqueueUpdate = function(component) {
  // 确保注入完成.
  ensureInjected();
  // 这里可以看到如果没有处在batchingUpdate状态, 则调用batchedUpdates方法
  if (!batchingStrategy.isBatchingUpdates) {
    batchingStrategy.batchedUpdates(enqueueUpdate, component);
    return;
  }
  // 如果正在batchingUpdate状态, 则把这个更新推入dirtyComponents中标记为
  // dirtyComponent等待批处理, 避免重复渲染
  // 当mountComponent或updateComponent时batchingStrategy.isBatchingUpdates
  // 会被标记为true, 之后会通过事务机制处理, 在更新结束后会把
  // batchingUpdate标记为false.
  dirtyComponents.push(component);
  if (component._updateBatchNumber == null) {
    component._updateBatchNumber = updateBatchNumber + 1;
  }
}
// batchingStrategy.batchedUpdates
var batchedUpdates = function(callback, a, b, c, d, e) {
    
  var alreadyBatchingUpdates = ReactDefaultBatchingStrategy.isBatchingUpdates;

  ReactDefaultBatchingStrategy.isBatchingUpdates = true;
  // 可以看到此处, 在isBatchingUpdates为true时, 根本不会调用到这个方法.
  // 当isBatchingUpdates为false时, 就会通过transaction.perform来处理
  // 那么true分支里的内容什么时候能被调用上呢.
  // 在挂载(Mounting phase)阶段_renderNewRootComponent方法里就对这个方法进行了调用
  // 使得此时挂载是同步挂载而非采取事务方式来挂载.
  // The code is written this way to avoid extra allocations
  if (alreadyBatchingUpdates) {
    return callback(a, b, c, d, e);
  } else {
    return transaction.perform(callback, null, a, b, c, d, e);
  }
}
```

所以在这里做一个总体概括解释: 

```typescript
// 未完待续....
```

