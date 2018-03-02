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

​    **React**事件系统框图: 

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

`ReactDOMComponent.mountComponent`

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

`ReactDOMCOmponent._updateDOMProperties`

```typescript
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

接下来一个一个方法来看, 首先是**listenTofa**方法: 

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
                               callback: Function): Object {
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

![EventHub.png](../Eventhub.png)

//.. 未完待续