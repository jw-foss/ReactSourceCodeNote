# React 中的事件机制

### § 2.3.1 React事件系统概览

​    对于**React**当中的事件, 用过React的同学们应该都知道. 在刚开始使用的时候, 会遇到一系列的坑,  那么这个事件机制的背后到底是个什么. 我摘抄了一句**React**文档中的一句对**SyntheticEvent**的概括的话

> Your event handlers will be passed instances of `SyntheticEvent`, a cross-browser wrapper around the browser’s native event. It has the same interface as the browser’s native event, including `stopPropagation()` and `preventDefault()`, except the events work identically across all browsers.
>
> If you find that you need the underlying browser event for some reason, simply use the `nativeEvent` attribute to get it. Every `SyntheticEvent` object has the following attributes:
>
> ```
> boolean bubbles
> boolean cancelable
> DOMEventTarget currentTarget
> boolean defaultPrevented
> number eventPhase
> boolean isTrusted
> DOMEvent nativeEvent
> void preventDefault()
> boolean isDefaultPrevented()
> void stopPropagation()
> boolean isPropagationStopped()
> DOMEventTarget target
> number timeStamp
> string type
> ```

​    通俗一点来讲, 就是我们所有注册的事件处理, 都会被传到这个**合成事件**的实例中去, 这个**合成事件**和我们浏览器所带的事件是具有同样的接口的. 包括`stopPropagation`和`preventDefault`这两个在前端开发中处理事件时经常用到的API.

####    1) **React**事件系统框图: 

```typescript
/**
 *
 * Overview of React and the event system:
 *
 * +------------+    .
 * |    DOM     |    .
 * +------------+    .
 *       |           .
 *       v           .
 * +------------+    .
 * | ReactEvent |    .
 * |  Listener  |    .
 * +------------+    .                         +-----------+
 *       |           .               +--------+|SimpleEvent|
 *       |           .               |         |Plugin     |
 * +-----|------+    .               v         +-----------+
 * |     |      |    .    +--------------+                    +------------+
 * |     +-----------.--->|EventPluginHub|                    |    Event   |
 * |            |    .    |              |     +-----------+  | Propagators|
 * | ReactEvent |    .    |              |     |TapEvent   |  |------------|
 * |  Emitter   |    .    |              |<---+|Plugin     |  |other plugin|
 * |            |    .    |              |     +-----------+  |  utilities |
 * |     +-----------.--->|              |                    +------------+
 * |     |      |    .    +--------------+
 * +-----|------+    .                ^        +-----------+
 *       |           .                |        |Enter/Leave|
 *       +           .                +-------+|Plugin     |
 * +-------------+   .                         +-----------+
 * | application |   .
 * |-------------|   .
 * |             |   .
 * |             |   .
 * +-------------+   .
 *                   .
 *    React Core     .  General Purpose Event Plugin System
 */
```

​    这个图可能看起来一头雾水, 稍微来对这张图进行一个分析: 

1. **React**会把所有在组件上声明注册的事件都绑定到**document**上.
2. 通过**document**等待事件的输入然后把事件传递出去给到**ReactEventListener**.
3. **ReactEventListener**会将在该类上注册的事件分发出去给到**ReactEventEmitter**
4. **ReactEventEmitter**会来负责执行储存在**EventPluginHub**里的事件
5. **EventPluginHub**主要是用来储存事件, 合成事件, 和之前讲到的事务一样, 都是通过对象池的方式来创建与销毁, 减少了很多不必要的开销.
6. 至于**SimpleEventPlugin**还有**TapEventPlugin**就是用来根据不同的事件, 生成不同的合成事件.(后面会具体讲到这个合成事件机制).



### § 2.3.2 事件系统原理

#### 1) 事件注册

​     在应用搭建的过程里, 大家都知道如何来声明一个DOM事件

```jsx
class App extends React.Component {
  render() {
    return (
     	<button onClick={(event) => console.log(event.type)}>
        	Click me!
      	</button>
    );
  }
}
```

​    这样的声明确实很简单, 上面也说到, 所有被声明的时间都需要通过**ReactEventListener**来注册然后存储到**EventPluginHub**当中. 那么这个注册过程是怎么样的呢. 实际上是在**ReactDOMComponent**的**mountComponent**的过程中

##### `<1>ReactDOMComponent.mountComponent`

```typescript
ReactDOMComponent.mountComponent = function () {
  // .... 省略代码
  
  // React自带的DOM节点树保存节点, 后面用来diff
  ReactDOMComponentTree.precacheNode(this, el);
      this._flags |= Flags.hasCachedChildNodes;
      if (!this._hostParent) {
        DOMPropertyOperations.setAttributeForRoot(el);
      }
  	  // 关键步骤, 在此处注册并绑定Listener
      this._updateDOMProperties(null, props, transaction);
      // 生成真实节点
      var lazyTree = DOMLazyTree(el);
      // 递归调用生成子节点, 这里就是为什么React的整个DOM节点能够一层一层被初始化的秘密
  	  // (其实不用说你们也知道是递归调用了🙄)
      this._createInitialChildren(transaction, props, context, lazyTree);
      // 把节点生成好之后交给ReactDOM._mountImageIntoNode方法来插入DOM中.
      mountImage = lazyTree;
  // ... 省略代码
}
```

​    通过这段调用之后, 这些对应的**Lisenters**在**ReactDOMComponent._updateDOMProperties**当中注册并保存, 接下来看一看这个方法里面发生了些什么东西.

##### `<2>ReactDOMCOmponent._updateDOMProperties`

```typescript
// 这个地方有个小东西要讲的是:
// 这个方法并不是只在挂载阶段调用, 更新阶段也会调用, 所以每次更新都会有一个方法的卸载和挂载过程
// 可以把方法的绑定在构造函数里就绑定好, 这样可以稍微节省一些性能.
// 而不是每次都传一个this.someMethod.bind(this, ...args)这样的操作
var _updateDOMProperties = function(lastProps, nextProps, transaction) {
    var propKey;
    var styleName;
    var styleUpdates;
  	// 遍历前一时刻的props
    for (propKey in lastProps) {
      if (
        nextProps.hasOwnProperty(propKey) ||
        !lastProps.hasOwnProperty(propKey) ||
        lastProps[propKey] == null
      ) {
        continue;
      }
      if (propKey === STYLE) {
        // ...无关代码
        // 如果registrationNameModules里面有这样的一个propKey
        // 实际上这个propKey代表的是事件名
      } else if (registrationNameModules.hasOwnProperty(propKey)) {
        if (lastProps[propKey]) {
          // Only call deleteListener if there was a listener previously or
          // else willDeleteListener gets called when there wasn't actually a
          // listener (e.g., onClick={null})
          // 解除Listener绑定
          deleteListener(this, propKey);
        }
      } else if (isCustomComponent(this._tag, lastProps)) {
       // 无关代码
      }
    }
    // 遍历当前props
    for (propKey in nextProps) {
      var nextProp = nextProps[propKey];
      var lastProp = propKey === STYLE
        ? this._previousStyleCopy
        : lastProps != null ? lastProps[propKey] : undefined;
      if (
        !nextProps.hasOwnProperty(propKey) ||
        nextProp === lastProp ||
        (nextProp == null && lastProp == null)
      ) {
        continue;
      }
      if (propKey === STYLE) {
        // 无关代码
        } else {
          this._previousStyleCopy = null;
        }
        if (lastProp) {
          // Unset styles on `lastProp` but not on `nextProp`.
          // ... 无关代码
          }
        } else {
          // Relies on `updateStylesByID` not mutating `styleUpdates`.
          styleUpdates = nextProp;
        }
      } else if (registrationNameModules.hasOwnProperty(propKey)) {
        // 重点就在这里, 如果这个registrationNameModules里有这样的一个propKey
        // 比如: onClick或者onKeydown这类的
        // 就会通过调用enqueuePutListener这个方法来注册
        if (nextProp) {
          enqueuePutListener(this, propKey, nextProp, transaction);
        } else if (lastProp) {
          deleteListener(this, propKey);
        }
      }
  // ... 省略一堆无关代码
  }
```

下面来看一下**enqueuePutListener**方法是怎么样来注册的

##### `<3>enqueuePutListener`

```typescript
var enqueuePutListener = function (
inst: ReactCompositeElementWrapper, 
 registrationName: string, 
 listener: Function, 
 transaction: ReactDefaultBatchingStrategyTransaction
) {
  if (transaction instanceof ReactServerRenderingTransaction) {
    return;
  }
  // ..开发阶段代码
  var containerInfo = inst._hostContainerInfo;
  var isDocumentFragment =
    containerInfo._node && containerInfo._node.nodeType === DOC_FRAGMENT_TYPE;
  var doc = isDocumentFragment
    ? containerInfo._node
    : containerInfo._ownerDocument;
  // 注册事件到document上.
  listenTo(registrationName, doc);
  // 事务操作调用putListener方法.
  transaction.getReactMountReady().enqueue(putListener, {
    inst: inst,
    registrationName: registrationName,
    listener: listener,
  });
}
```

这个方法一共做了两个微小的操作: 

1. 通过调用**listenTo**方法在**document**上注册了事件
2. 将事件通过事务调用**putListener**储存放进了存储池内.

接下来一个一个方法来看, 首先是**listenTo**方法: 

##### `<4>listenTo`

```typescript
// 值得注意的事情是, 事件真正的处理并未在此处发生
// 而是在putListener当中才做好了挂载
var listenTo = function(
	registrationName: string, // 合成事件名
	contentDocumentHandle: HTMLElement): void { // 挂载节点
 	var mountAt = contentDocumentHandle;
    // 取到挂载节点上的所有挂载事件.
    var isListening = getListeningForDocument(mountAt);
	// 注意此处的EventPluginRegistry.registrationNameDependencies
	// 是一个合成事件的Map, 通过传入的registrationName
	// 像: onClick 这样的string, 通过这个onClick键去查找对应的合成事件
	// 想知道这个合成事件有哪些可以去到 EventPluginRegistry.js文件里具体查看
    var dependencies =
      EventPluginRegistry.registrationNameDependencies[registrationName];
    // 这一步的过程实际上就是用来注册合成事件, 刚开始我也没弄懂为什么
	// 实际上这里很聪明的把所有应用里要用到的时间注册了一遍, 这样有个好处是
	// 不会在最上层节点上监听一堆不相关的事件, 这样也可以减少一些开销.
	// 然后这个方法里面还通过一个trapBubbledEvent, 和trapCapturedEvent两个
	// 方法用来注册冒泡和捕获事件.
	// 其中, 如果要注册捕获事件, 需要给事件名上多加上Capture来标明这是一个捕获事件
	// 例如, onClickCapture.
    for (var i = 0; i < dependencies.length; i++) {
      var dependency = dependencies[i];
      // 省略一大部分代码... 
        isListening[dependency] = true;
      }
    }
}
// 这里仅把trapCapturedEvent给拉出来单独讲一下
  // trapCapturedEvent 
  var trapCapturedEvent = function(
	topLevelType: string, 
    handlerBaseName: string,
    element: HTMLElement): void {
    if (!element) {
      return null;
    }
    return EventListener.capture(
      element,
      handlerBaseName,
      ReactEventListener.dispatchEvent.bind(null, topLevelType),
    );
  }
var capture = function capture(target: HTMLElement, 
                               eventType: string,
                               callback: Function): {remove: Function} {
    // 这里就是很简单的事件挂载.
  	// 注意此处的一个挂载的callback, 是React自带的dispatchEvent.
  	// 当事件触发时, 如: click. document接收到这个事件之后
    // 通过触发这个callback来调用dispatch统一分发事件
  	// 该方法返回一个remove方法. 通过这个方法来卸载事件.
    if (target.addEventListener) {
      target.addEventListener(eventType, callback, true);
      return {
        remove: function remove() {
          target.removeEventListener(eventType, callback, true);
        }
      };
    } else {
	// return一个空方法
      return {
        remove: emptyFunction
      };
    }
  }
```

​    接下来就是**putListener**方法

##### `<5>putListener`

```Typescript
function putListener(): void {
  // 这个方法在最后是被事务通过CallbackQueue.notifyAll()方法调用
  // 此处是通过调用函数callback.call(context, arg). 所以此处的
  // this就是一个包含了instance对象的一个对象, 最根本的调用就是
  // ventPluginHub.putListener
  var listenerToPut = this;
  EventPluginHub.putListener(
    listenerToPut.inst,
    listenerToPut.registrationName,
    listenerToPut.listener)
}
// 注意此处的这个EventPluginHub在上面说到过是用来存储, 合成Listener的地方
EventPluginHub.putListener = function(
			inst: ReactDOMComponent, 
            registrationName: string,
            listener: Function
            ): void {
	// ... 省略无关代码
  	// 生成一个rootID的key, 用来标识注册事件的对象
    var key = getDictionaryKey(inst);
  	// 拿到listenerBank用来存放新的listener
    var bankForRegistrationName =
      listenerBank[registrationName] || (listenerBank[registrationName] = {});
    // 存储
    bankForRegistrationName[key] = listener;
    // 可以理解为一个对于Plugin的生命周期的函数
    var PluginModule =
      EventPluginRegistry.registrationNameModules[registrationName];
    if (PluginModule && PluginModule.didPutListener) {
      PluginModule.didPutListener(inst, registrationName, listener);
    }
}
```

​    到这里, 整个注册流程结束了. 通过**mountComponent**或者**updateComponent**方法把调用**_updateProperties**, 然后来把对应的事件先挂载在**Document**上, 然后把对应的处理回调放到**EventBank**里储存起来.

#### 2) 事件派发

​    注册阶段结束之后, 来到了**React**的稳定周期, 此时, 一旦用户与应用发生交互行为(基本就是一系列的事件操作), **React**接收到事件之后, 会通过**`ReactEventListener.dispatchEvent`**方法派发执行并且根据情况更新DOM. 

​    那么接下来仔细看一看这个**dispatch**方法里到底发生了一些什么操作吧.

##### `<1>ReactEventListener.dispatchEvent`

```typescript
// 当用户点击, 或者输入时, 该方法触发
// 合成事件名和浏览器事件对象被传入方法
// 通过事务方式来处理React的事件.
var dispatchEvent = function(topLevelType: string, nativeEvent: Event): void {
  if (!ReactEventListener._enabled) {
      return;
    }
  // 从对象池中取出缓存的bookKeeping. 关于为什么要用池的好处, 也许会抽一小节专门来介绍.
  // 这个地方的bookKeeping对象呢是一个保存着nativeEvent和topLevelType的一个对象.
  var bookKeeping = TopLevelCallbackBookKeeping.getPooled(
    topLevelType,
    nativeEvent,
  );
  try {
    // Event queue being processed in the same cycle allows
    // `preventDefault`.
    // 和之前一样的事务操作, 通过batchedUpdates调用handleTopLevelImpl
    // 这里的handleTopLevelImpl其实就是重中之重
    ReactUpdates.batchedUpdates(handleTopLevelImpl, bookKeeping);
  } finally {
    TopLevelCallbackBookKeeping.release(bookKeeping);
  }
 }
}

var handleTopLevelImpl = function(bookKeeping: TopLevelCallbackBookKeeping) {
  // 先从浏览器的事件对象上找到触发事件的那个靶对象.
  // 然后通过这个靶对象从ReactDOMTree当中取出来.
  var nativeEventTarget = getEventTarget(bookKeeping.nativeEvent);
  var targetInst = ReactDOMComponentTree.getClosestInstanceFromNode(
    nativeEventTarget,
  );

  // Loop through the hierarchy, in case there's any nested components.
  // It's important that we build the array of ancestors before calling any
  // event handlers, because event handlers can modify the DOM, leading to
  // inconsistencies with ReactMount's node cache. See #1105.
  // 在调用回调之前. 由于回调函数也许会改变原有DOM结构, 所以需要生成一个祖先节点数组.
  // 来储存原始的真实DOMtree, 把所有的祖先节点都存下来之后就可以通过一个遍历操作调用回调.
  // 从这一层操作其实可以看到一个问题. 那就是事件并不是通过浏览器的原生调用来执行的.
  // 此处的执行顺序是 target -> parentNode -> ancestorNode.
  // 跟DOM事件的冒泡顺序一致, 但是注意一点, DOM事件可以阻止冒泡, 而此处不可以
  // 因为callback并不能被终止执行(除非你抛错, 当然抛错会导致一些不可预测的问题).
  var ancestor = targetInst;
  do {
    bookKeeping.ancestors.push(ancestor);
    ancestor = ancestor && findParent(ancestor);
  } while (ancestor);

  for (var i = 0; i < bookKeeping.ancestors.length; i++) {
    targetInst = bookKeeping.ancestors[i];
    ReactEventListener._handleTopLevel(
      bookKeeping.topLevelType,
      targetInst,
      bookKeeping.nativeEvent,
      getEventTarget(bookKeeping.nativeEvent), //我不是很明白为什么上面有一个nativeEventTarget
      // 这里还要再调用一次方法去拿. 看不懂... 也许FB的工程师也没有想象中那么厉害?
    );
  }
}
```

​    从上面的执行函数可以看到. 最终的callback的调用是由**ReactEventListener._handleTopLevel**这个方法来调用的. 这个方法在初始化注入时被注入, 实体方法是**`ReactEventEmitterMixin.handleTopLevel`**: 

##### `<2>ReactEventEmitterMixin.handleTopLevel`

```typescript
handleTopLevel: function(
    topLevelType: string,
    targetInst: ReactDOMComponent,
    nativeEvent: Event,
    nativeEventTarget: HTMLElement,
  ): void {
    // 构造合成事件.
    var events = EventPluginHub.extractEvents(
      topLevelType,
      targetInst,
      nativeEvent,
      nativeEventTarget,
    );
    // 把合成事件传入该方法来调用合成事件.
    runEventQueueInBatch(events);
  }
```

​    要明白这里的合成事件是如何构造出来的. 首先就要去看一下这个**`EventPluginHub.extractEvents`**方法里面到底发生了写什么东西

##### `<3>EventPluginHub.extractEvents`

```typescript
var extractEvents = function(
    topLevelType: string,
    targetInst: ReactDOMComponent,
    nativeEvent: Event,
    nativeEventTarget: HTMLElement,
  ): Event | Array<Event> {
    var events;
    // 此处的Plugins也是在初始化的注入过程中注入的, 下面会举一个例子来看看这些个plugin
    // 到底是个什么东西
    var plugins = EventPluginRegistry.plugins;
    for (var i = 0; i < plugins.length; i++) {
      // Not every plugin in the ordering may be loaded at runtime.
      var possiblePlugin = plugins[i];
      if (possiblePlugin) {
        var extractedEvents = possiblePlugin.extractEvents(
          topLevelType,
          targetInst,
          nativeEvent,
          nativeEventTarget,
        );
        if (extractedEvents) {
          // 这里的操作非常简单, 实际来说就是把事件合成到一个Array | List里面
          // 然后把这个合成好的events 扔出去
          events = accumulateInto(events, extractedEvents);
        }
      }
    }
    return events;
  }

// Plugin Injection
// 每一种Plugin会处理对应的事件, 分别处理哪些其实可以从Plugin的名字上看出来
ReactInjection.EventPluginHub.injectEventPluginsByName({
    SimpleEventPlugin: SimpleEventPlugin, //诸如 Click Focus Blur, keydown事件等
    EnterLeaveEventPlugin: EnterLeaveEventPlugin, //MouseEnter, MouseLeave事件等
    ChangeEventPlugin: ChangeEventPlugin, // Change事件
    SelectEventPlugin: SelectEventPlugin, // Select事件
    BeforeInputEventPlugin: BeforeInputEventPlugin, // BeforeInput的处理
  });
```

​    上面一共有5种plugin, 具体对应不同的浏览器事件处理, 简单把**SimpleEventPlugin**拿出来看一看, 其它的可以去看源代码.

##### `<4>SimpleEventPlugin`

```typescript
var SimpleEventPlugin = {
  // 这边主要关心extractEvents方法
  extractEvents: function(
  		  topLevelType: string,
          targetInst: ReactDOMComponent,
          nativeEvent: Event,
          nativeEventTarget: HTMLElement,): null | ReactSyntheticEvent {
    var dispatchConfig = topLevelEventsToDispatchConfig[topLevelType];
    if (!dispatchConfig) {
      return null;
    }
    // 由于代码过多, 就只抽一部分出来讲.
    switch (topLevelType) {
       case 'topKeyPress':
        // Firefox creates a keypress event for function keys too. This removes
        // the unwanted keypress events. Enter is however both printable and
        // non-printable. One would expect Tab to be as well (but it isn't).
        if (getEventCharCode(nativeEvent) === 0) {
          return null;
        }
      /* falls through */
      case 'topKeyDown':
      case 'topKeyUp':
        // 所有的键盘事件被合成为一个SyntheticKeyboardEvent;
        // SyntheticKeyboardEvent继承自SyntheticUIEvent和SyntheticEvent.
        EventConstructor = SyntheticKeyboardEvent;
        break;
    }
	// 还是对象池, 充分提高性能
    var event = EventConstructor.getPooled(
      dispatchConfig,
      targetInst,
      nativeEvent,
      nativeEventTarget,
    );
    // 构造捕获和冒泡的回调队列.
    // 简单来讲这个方法的作用就是:
    // var callbacks = [], capturingCbs = [], bublingCbs = [];
	// callbacks = callbacks.concat(capturingCbs, bublingCbs);
    // 把这个callbacks给挂载到event对象上, 这样就可以按捕获 -> 冒泡 顺序调用.
    EventPropagators.accumulateTwoPhaseDispatches(event);
    return event;
  }
}
```

​    一旦这个Extract过程结束, 就会把返回出来的events对象给到**`runEventQueueInBatch`**方法来做批处理执行所有的callback

##### `<5>runEventQueueInBatch`

```typescript
var runEventQueueInBatch = function(events: Array<SyntheticEvent>) {
  EventPluginHub.enqueueEvents(events);
  EventPluginHub.processEventQueue(false);
};
// 
var enqueueEvents = function(events: Array<SyntheticEvent>) {
  if (events) {
    eventQueue = accumulateInto(eventQueue, events);
  }
};
var processEventQueue = function(simulated) {
  // Set `eventQueue` to null before processing it so that we can tell if more
  // events get enqueued while processing.
  // 把事件队列置空, 这样可以检测到在队列进行当中是否有被推入新的事件.
  var processingEventQueue = eventQueue;
  eventQueue = null;
  if (simulated) {
    forEachAccumulated(
      processingEventQueue,
      executeDispatchesAndReleaseSimulated,
    );
  } else {
    // 通过executeDispatchesAndReleaseTopLevel来处理事件队列
    forEachAccumulated(
      processingEventQueue,
      // 这个方法实际是调用EventPluginUtils.executeDispatchesInOrder(event, simulated);
      executeDispatchesAndReleaseTopLevel
    );
  }
  // ...省略警告代码
  // This would be a good time to rethrow if any of the event handlers threw.
  // 在这里把出现的错误抛出
  ReactErrorUtils.rethrowCaughtError();
}
// executeDispatchesInOrder
function executeDispatchesInOrder(event: SyntheticEvent, simulated: boolean) {
  // 这里可以看到之前做的处理当中 这两个字段的作用
  var dispatchListeners = event._dispatchListeners;
  var dispatchInstances = event._dispatchInstances;
  // ... 省略开发阶段代码
  if (Array.isArray(dispatchListeners)) {
    for (var i = 0; i < dispatchListeners.length; i++) {
      if (event.isPropagationStopped()) {
        break;
      }
      // Listeners and Instances are two parallel arrays that are always in sync.
      executeDispatch(
        event,
        simulated,
        dispatchListeners[i],
        dispatchInstances[i],
      );
    }
  } else if (dispatchListeners) {
    executeDispatch(event, simulated, dispatchListeners, dispatchInstances);
  }
  // 重置对象
  event._dispatchListeners = null;
  event._dispatchInstances = null;
}

function executeDispatch(event: SyntheticEvent,
                         simulated: boolean,
                         listener: Function, 
                         inst: ReactDOMComponent) {
  var type = event.type || 'unknown-event';
  event.currentTarget = EventPluginUtils.getNodeFromInstance(inst);
  if (simulated) {
    ReactErrorUtils.invokeGuardedCallbackWithCatch(type, listener, event);
  } else {
    // 真正的事件响应调用, 在这个方法里面用了try...catch语句块来先吞掉错误
    ReactErrorUtils.invokeGuardedCallback(type, listener, event);
  }
  event.currentTarget = null;
}
```

###     § 2.3.3 总结

稍微来总结一下事件的机制:

1. 当应用启动时, 会把所有需要响应的事件注册在**EventHub**中, 然后把事件类型挂载在**document**对象上.
2. **document**监听到有注册过的DOM事件, 比如 **click**, **mouseover**.
3. 通过唯一的响应方法`dispatch`来分发事件, 这里的`dispatch`照样是一个事务操作, 当事务处理时, 会先拿到事件触发的靶对象的所有的**祖先节点**, 然后对每一个**祖先节点**都进行相应的处理: 
4. 首先, 从**eventBank**里通过`extractEvent`方法把对应节点注册的回调函数全部抓取出来, 然后再通过`runEventQueueInBatch`调用`processEventQueue`实际调用`executeDispatchesInOrder`方法, 用该方法来调用`executeDispatch`通过传入一个`SyntheticEvent`对象给到开发者给出的`callback`来执行.
5. 整个响应过程结束.
6. 如果该过程中伴随有**state**或者**props**的变化, 那么对应的会引起DOM的更新.
7. 如果根据对比结果会有更新, 那么事件将会被注销然后重新绑定到对应的**component**上, 这么做的好处是在于, 如果一个Component根据比对之后不会在存在于整个应用当中, 销毁对应的事件, 防止内存泄漏.
8. 事件处理结束

![EventHub.png](../Eventhub.png)



对于React这种事件处理机制, 实际上是有他本身的好处的

* 统一收集事件, 统一分发.
* 进一步的提高性能, 能更好的去处理事件响应而触发的更新操作.