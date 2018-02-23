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

​   这张图其实已经可以解释得很清楚了, React当中采用事务处理实际上就是采用Wrapper把要调用的方法包裹起来,  在调用方法之前, 先把包裹层(initialize)方法调用, 然后再到调用方法本身, 最后在结束时, 调用包裹层(close)方法, 在这里这个处理跟[underscore](http://underscorejs.org/)的`_.before`, `_.after`有些类似, 也可以理解为方法的**劫持调用**.下面 我们来具体看一看实现过程.

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

var TRANSACTION_WRAPPERS: Array<TransactionWrapper> = [FLUSH_BATCHED_UPDATES, RESET_BATCHED_UPDATES];

class ReactDefaultBatchingStrategyTransaction implements TransactionImpl {
  constructor() {
    this.reinitializeTransaction();
  }
  // 省略掉某些方法实现
  // 覆盖类方法
  getTransactionWrappers(): Array<TransactionWrapper> {
    return TRANSACTION_WRAPPERS
  }
}
// 这个transaction的调用在下面👇
var transaction: ReactDefaultBatchingStrategyTransaction = new ReactDefaultBatchingStrategyTransaction();
// 当在调用这个transaction.perform方法的时候实际上是这样的: 
/**
 *
 *
 *            +----------------------+    +---------------------+        +----------+
 * perform -> |FLUSH_BATCHED_UPDATES.| -> |REST_BATCHED_UPDATES.| -----> |  method  |
 *            |      initialize      |    |      initialize     |        |          |
 *            +----------------------+    +---------------------+        +----------+
 *                                                                            |
 *            +----------------------+    +----------------------+            |
 *            |REST_BATCHED_UPDATES. |    |FLUSH_BATCHED_UPDATES.|            |
 *            |        close         |    |        close         | <----------+
 *            +----------------------+    +----------------------+
 */
```

​	从这上面的调用不难看出, 由于两个`initialize`调用实际上都是对一个`emptyFunc`的调用并不起任何作用, 而`REST_BATCHED_UPDATES.close` 的作用就是把标识符复位, 所以主要的过程是发生在这个`FLUSH_BATCHED_UPDATES.close`中的, 下面来看一看这个close方法里面的调用过程:

```typescript
// close指向
close: ReactUpdates.flushBatchedUpdates.bind(ReactUpdates)
// ReactUpdates.flushBatchedUpdates

var flushBatchedUpdates = function(): void {
  // ReactUpdatesFlushTransaction's wrappers will clear the dirtyComponents
  // array and perform any updates enqueued by mount-ready handlers (i.e.,
  // componentDidUpdate) but we need to check here too in order to catch
  // updates enqueued by setState callbacks and asap calls.
  
  while (dirtyComponents.length || asapEnqueued) {
    if (dirtyComponents.length) {
      // 从事务池里拿到事务
      // PS: 此处的事务与上面的事务并不是同一种事务
      var transaction: ReactUpdatesFlushTransaction = ReactUpdatesFlushTransaction.getPooled();
      // 这里就是update具体的实现
      transaction.perform(runBatchedUpdates, null, transaction);
      // 把事务储存在事务池中
      ReactUpdatesFlushTransaction.release(transaction);
    }
	// 提前完成回调过程, 暂时不做详细解释
    if (asapEnqueued) {
      asapEnqueued = false;
      var queue = asapCallbackQueue;
      asapCallbackQueue = CallbackQueue.getPooled();
      queue.notifyAll();
      CallbackQueue.release(queue);
    }
  }
};
```
具体的处理发生在`transaction.perform(runBatchedUpdates, null, transaction)`中间, 接着来看一看`runBatchedUpdates`方法做了哪些微小的贡献🙂
```typescript
function runBatchedUpdates(transaction: ReactUpdatesFlushTransaction): void {
  var len: number = transaction.dirtyComponentsLength;
  // 检查长度一致性
  invariant(
    len === dirtyComponents.length,
    "Expected flush transaction's stored dirty-components length (%s) to " +
      'match dirty-components array length (%s).',
    len,
    dirtyComponents.length,
  );

  // Since reconciling a component higher in the owner hierarchy usually (not
  // always -- see shouldComponentUpdate()) will reconcile children, reconcile
  // them before their children by sorting the array.
  // 对dirtyComponents 做一个排序操作, 用来排列更新顺序
  dirtyComponents.sort(mountOrderComparator);

  // Any updates enqueued while reconciling must be performed after this entire
  // batch. Otherwise, if dirtyComponents is [A, B] where A has children B and
  // C, B could update twice in a single batch if C's render enqueues an update
  // to B (since B would have already updated, we should skip it, and the only
  // way we can know to do so is by checking the batch counter).

  // 这里一段注释大致的意思就是说, 在这个调用阶段被推入队列的更新操作, 只会发生在本次更新之后,
  // 否则, 举了个例子: 
  // 如果dirtyComponents是 [A, B], B, C 是A 的子组件, 如果C 的render 调用推入了一个更新调用给到B
  // B也许会在一次更新时间内更新两次, (由于B已经被更新过了, 那么将会通过检查更新计
  // 数器的方式来跳过这次更新)
  updateBatchNumber++;

  for (var i = 0; i < len; i++) {
    // If a component is unmounted before pending changes apply, it will still
    // be here, but we assume that it has cleared its _pendingCallbacks and
    // that performUpdateIfNecessary is a noop.
    var component = dirtyComponents[i];

    // If performUpdateIfNecessary happens to enqueue any new updates, we
    // shouldn't execute the callbacks until the next render happens, so
    // stash the callbacks first
    // 暂存回调, 并且清空回调队列
    var callbacks = component._pendingCallbacks;
    component._pendingCallbacks = null;

    var markerName;
    if (ReactFeatureFlags.logTopLevelRenders) {
      var namedComponent = component;
      // Duck type TopLevelWrapper. This is probably always true.
      if (component._currentElement.type.isReactTopLevelWrapper) {
        namedComponent = component._renderedComponent;
      }
      markerName = 'React update: ' + namedComponent.getName();
      console.time(markerName);
    }
    // 更新操作调用
    ReactReconciler.performUpdateIfNecessary(
      component,
      transaction.reconcileTransaction,
      updateBatchNumber,
    );

    if (markerName) {
      console.timeEnd(markerName);
    }

    // 如果回调队列存在(即存有回调方法), 那么就往回调队列里推入对应的回调函数和publicInstance
    if (callbacks) {
      for (var j = 0; j < callbacks.length; j++) {
        transaction.callbackQueue.enqueue(
          callbacks[j],
          component.getPublicInstance(),
        );
      }
    }
  }
}

// 排序函数
function mountOrderComparator(c1, c2) {
  return c1._mountOrder - c2._mountOrder;
}

```
接着重点部分是`runBatchedUpdates`方法中对于`ReactReconciler.performUpdateIfNecessary`的调用:

```typescript
performUpdateIfNecessary = function(
    internalInstance,
    transaction,
    updateBatchNumber,
  ): void {
    // 比对updateBatchNumber, 注意这个地方刚刚说到的
    // updateBatchNumber就是一个更新队列的标志, 属于同一批次的更新
    // 该对象的值是一样的
    if (internalInstance._updateBatchNumber !== updateBatchNumber) {
      // The component's enqueued batch number should always be the current
      // batch or the following one.
      warning(
        internalInstance._updateBatchNumber == null ||
          internalInstance._updateBatchNumber === updateBatchNumber + 1,
        'performUpdateIfNecessary: Unexpected batch number (current %s, ' +
          'pending %s)',
        updateBatchNumber,
        internalInstance._updateBatchNumber,
      );
      return;
    }
    if (__DEV__) {
      // ...开发阶段代码
    }
     // 调用组件中的performUpdateIfNecessary方法
     // 关于internalInstance请看下面👇
     // ⌘ + F or ctrl + F 搜索 ReactUpdateQueue.enqueueSetState
    internalInstance.performUpdateIfNecessary(transaction);
    if (__DEV__) {
      // ...开发警告代码
      }
    }
  }
```
 
稍微来看一下ReactCompositeComponent 当中的performUpdateIfNecessary方法

```typescript
performUpdateIfNecessary = function(): void {
    // 检查是否有处在等待队列中的Element, 如果有的话调用ReactReconciler.receiveComponent
    // 对组件更新
    if (this._pendingElement != null) {
      ReactReconciler.receiveComponent(
        this,
        this._pendingElement,
        transaction,
        this._context,
      );
    // 如果没有处在等待队列的Element, 切状态等待队列并不为空或者强制更新队列不为空
    // 调用组件本身updateComponent
    } else if (this._pendingStateQueue !== null || this._pendingForceUpdate) {
      this.updateComponent(
        transaction,
        this._currentElement,
        this._currentElement,
        this._context,
        this._context,
      );
    // 
    } else {
      this._updateBatchNumber = null;
    }
}
```
至此更新操作基本算是结束了, 但是细心的你应该会有疑问, 这些方法里面根本就没有把**dirtyComponent**这个数组长度减少的代码, 这也是正要讲的一个点, 刚才在`transaction.perform`中也讲到了, 此处的transaction是另外一种transaction的对象, 拥有的事务处理与之前的**ReactReconcilerTransaction**不同, 而是**ReactUpdatesFlushTransaction**的实例, 毫无疑问的是, 这个事务操作里当然会有涉及到把**dirtyComponents**队列清空的操作, 还有一些其他的操作:
```typescript
// 调用顺序:
/**
 *
 *   initialize: NESTED_UPDATES ---> UPDATE_QUEUEING  ---> method
 *                                                            |
 *                                                            |
 *    close:         NESTED_UPDATES <--- UPDATE_QUEUEING   <--+
 *
 */
var NESTED_UPDATES = {
  initialize: function() {
    // 保存当前队列长度
    this.dirtyComponentsLength = dirtyComponents.length;
  },
  close: function() {
    // 对比队列长度是否与保存的一致
    // 由于钩子函数componentDidUpdate 当中有可能会有更新调用导致
    // dirtyComponents 长度不一致如果在这中间有设置则递归调用flushBatchedUpdates方法
    // 若长度一致, 则清空整个更新队列
    if (this.dirtyComponentsLength !== dirtyComponents.length) {
      // Additional updates were enqueued by componentDidUpdate handlers or
      // similar; before our own UPDATE_QUEUEING wrapper closes, we want to run
      // these new updates so that if A's componentDidUpdate calls setState on
      // B, B will update before the callback A's updater provided when calling
      // setState.
      dirtyComponents.splice(0, this.dirtyComponentsLength);
      flushBatchedUpdates();
    } else {
      dirtyComponents.length = 0;
    }
  },
};

var UPDATE_QUEUEING = {
  initialize: function() {
    // 初始化回调队列
    this.callbackQueue.reset();
  },
  close: function() {
    // 调用队列中所有的回调函数, 并清空队列
    this.callbackQueue.notifyAll();
  },
};

var TRANSACTION_WRAPPERS = [NESTED_UPDATES, UPDATE_QUEUEING];
```


​     [上一章](./Chapter §2.1 生命周期.md)我们了解到了`setState`方法实际上就是调用了`this.updater.enqueueSetState`, 那么我们来看看这个`enqueueSetState`方法到底是个什么东西, 在这背后到底发生了什么.

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
 *  Mounting phase:  ReactComponent::updater(类成员)  <-------- ReactQueue;
 *                               | calling                           ^
 *                               v                                   |
 *  Updating phase:  enqueueSetState ----- actually belongs to-------+
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
    // internalInstance 实际上是被ReactCompositeComponentWrapper 包装过的Component
  	// 比如有这样一个Component: App;
    // publicInstance instanceOf ReactCompositeComponent
    // internalInstance instanceOf ReactCompositeComponentWrapper
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
  // 当mountComponent 或updateComponent 时batchingStrategy.isBatchingUpdates
  // 会被标记为true, 之后会通过事务机制处理, 在更新结束后会把
  // batchingUpdate 标记为false.
  dirtyComponents.push(component);
  if (component._updateBatchNumber == null) {
    component._updateBatchNumber = updateBatchNumber + 1;
  }
}
// batchingStrategy.batchedUpdates
var batchedUpdates = function(callback, a, b, c, d, e) {
    
  var alreadyBatchingUpdates = ReactDefaultBatchingStrategy.isBatchingUpdates;

  ReactDefaultBatchingStrategy.isBatchingUpdates = true;
  // 可以看到此处, 在isBatchingUpdates 为true时, 根本不会调用到这个方法.
  // 当isBatchingUpdates 为false时, 就会通过transaction.perform来处理
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

在React 组件的存在阶段, 一旦触发了任何使得Component必须要被更新的操作, 例如调用了`setState`方法, 那么此刻`setState`就会通过调用类成员里的`updater.enqueueSetState`方法, 该方法一共做了两件事:
  1. 对React Component类成员中的_pendingStateQueue 数组里面推入了这个新的state.
  2. 调用了enqueueUpdate方法.

`enqueueUpdate`方法: 
1. 首先会将**isBatchingUpdates**标记为**true**, 然后此时通过事务调用`enqueueUpdate`自身.
2. 当事务调用启动时, 调用`enqueueUpdate`就会向**dirtyComponents**中**push**需要更新的<u>**Component**</u>
3. 当这段调用结束, 就会执行事务的`FLUSH_BATCHED_UPDATES.close`方法,该方法通过调用`ReactUpdates.flushBatchedUpdates`方法来调用`runBatchedUpdates`方法 

4. `runBatchedUpdates`方法被通过事务调用: 
    1. 初始化阶段保存更新队列长度(为后面的递归调用做准备), 清零回调函数队列
    2. `runBatchedUpdates`方法调用: 
        * 调用需要更新组件上的`UpdateComponent`方法
        * 向回调函数队列中推入回调函数等待调用
    3. 结束阶段检查是否有新的更新被推入, 如果有则通过递归调用继续更新如果没有则调用回调函数队列中的所有回调.
5. 当这段方法结束通过把`isBathingUpdates`标识符重置来结束更新操作.
6. 至此, 整个更新操作结束.