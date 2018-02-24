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



//.. 未完待续