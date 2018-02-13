#### `§1.3 ReactMount.render`

​	通过在   `ReactMount.js`里面查找可以发现, 其实render是对ReactMount上的成员函数_renderSubtreeIntoContainer的一个调用, 该函数一共做了以下几个步骤 

```typescript
// Entry point 
ReactMount.render: function(nextElement, // 下一个元素节点
                             container, // 节点容器
                             callback, // 回调
                            ) {
    return _renderSubtreeIntoContainer(
      null,
      nextElement,
      container,
      callback,
    );
  }; 
```

###### `§1.3.1 _renderSubtreeIntoContainer`

```typescript
// implementation
_renderSubtreeIntoContainer: function(
    parentComponent, // 父节点
    nextElement, // 下一个即将渲染的元素节点
    container, // 节点容器
    callback, // 回调
    ) {
      // ... 代码片段忽略 (此处代码为检测性代码, 故略过)
      
    // 此处对下一个节点元素进行包装
    // 后面会解释这个TopLevelWrapper到底是个什么包装器
    // 把当前下一个元素节点包装成TopLevelWrapper的子节点
    var nextWrappedElement = React.createElement(TopLevelWrapper, {
      child: nextElement,
    });
	
    var nextContext;
    // 此处是为了对Context的传递做一个处理
	// 是React Content 传递实现的重要的一步, 后面会讲到
    // 可暂时忽略
    if (parentComponent) {
      var parentInst = ReactInstanceMap.get(parentComponent);
      nextContext = parentInst._processChildContext(parentInst._context);
    } else {
      nextContext = emptyObject;
    }
	
    // 获取上一个挂载的节点 用作diff 在第一次调用时是null
    var prevComponent = getTopLevelWrapperInContainer(container);
	
    // 上一个元素节点
    // PS 这里的上和下 实际上应该是同一个Component在不同时间轴上的表现
    // 而并非是两个不同的Component
    //    ComponentA       ComponentA
    //  (stateA|propsA)  (stateB|propsB)
    // --------------------------------------------------- time-axis
    //         ↑              ↑
    //         |              |
    //       time A         time B
    // Element = (state|props)Component
    // 简而言之就是在不同的时间点, 一个Component也许会有不同的
    // 状态或属性 而View 与 Component呈线性关系 即
    // View = F(component);
    if (prevComponent) {
      var prevWrappedElement = prevComponent._currentElement;
      var prevElement = prevWrappedElement.props.child;
      // 如果该component存在 并且与下一个component的节点不相等
      // 此时就需要调用update方法来更新DOM
      // 此处shouldUpdateReactComponent会在后面讲到
      // TODO: shouldUpdateReactComponent
      if (shouldUpdateReactComponent(prevElement, nextElement)) {
        var publicInst = prevComponent._renderedComponent.getPublicInstance();
        var updatedCallback =
          callback &&
          function() {
            callback.call(publicInst);
          }
        ReactMount._updateRootComponent(
          prevComponent,
          nextWrappedElement,
          nextContext,
          container,
          updatedCallback,
        );
        return publicInst;
      } else {
        // 解除挂载
        ReactMount.unmountComponentAtNode(container);
      }
    }
    // 注意此处, 如果上述条件中存在上一个节点元素 并且shouldUpdateReactComponent
    // 返回结果是false, 那么就会先卸载挂载节点然后通过下面继续完成挂载

    // 从容器节点拿到react的根节点
    var reactRootElement = getReactRootElementInContainer(container);
    var containerHasReactMarkup =
      reactRootElement && !!internalGetID(reactRootElement);
    var containerHasNonRootReactChild = hasNonRootReactChild(container);

    // ... 省略掉一部分开发警告
	
    var shouldReuseMarkup =
      containerHasReactMarkup &&
      !prevComponent &&
      !containerHasNonRootReactChild;
    // 重新挂载新的根节点
    var component = ReactMount._renderNewRootComponent(
      nextWrappedElement,
      container,
      shouldReuseMarkup,
      nextContext,
    )._renderedComponent.getPublicInstance();
    if (callback) {
      callback.call(component);
    }
    return component;
    // 至此整个挂载的调用结束 但并不代表这里已经结束了
    // 还有很多方法过程调用在这背后, 稍后会讲到
   }
```

###### `§1.3.2 TopLevelWrapper`

​	关于`TopLevelWrapper` , 简单来看看一下`TopLevelWrapper`是个什么东西	

```typescript
var TopLevelWrapper = function() {
  this.rootID = topLevelRootCounter++;
};
TopLevelWrapper.prototype.isReactComponent = {};

TopLevelWrapper.prototype.render = function() {
  return this.props.child;
};

TopLevelWrapper.isReactTopLevelWrapper = true;

// 此处进行nextWrappedElement的一个instantiation 
var nextWrappedElement = React.createElement(TopLevelWrapper, {
      child: nextElement,
    });
ReactMount._renderNewRootComponent(
      nextWrappedElement,
      container,
      shouldReuseMarkup,
      nextContext,
    )
// 就让我们走进科学(大雾 _(:з」∠)_
// 去仔细看看_renderNewRootComponent里面到底发生了什么吧
```

​	实际上这个`TopLevelWrapper`非常简单, 它把nextElement强行给包装成为了一个`CompositeElement`, 如果忘记的可以上去查看第[§1.2.4 #3](#`3. 用户自定义节点`)小节

###### `§1.3.3 _renderNewRootComponent`

```typescript
// ReactMount._renderNewRootComponent
function _renderNewRootComponent(nextElement, container, shouldReuseMarkup, nextContext) {
    // 对... 没错... 就是这么短
    ReactBrowserEventEmitter.ensureScrollValueMonitoring();
    // 刚才被包装的nextWrappedElement就被送进这个instantiate方法
    // 不记得这个方法的话请翻到上面的§1.24节的第3个子节点看看
    // 链接在上方
    var componentInstance = instantiateReactComponent(nextElement, false);
	// 第一次渲染过程是同步进行, 但是在这之后在
    // componentWillMount或者componentDidMount中发生的任何更新操作
    // 都会被批量的送入到更新队列中
    ReactUpdates.batchedUpdates(
      batchedMountComponentIntoNode, // 见下, 其它几个参数都是为了这个函数
      componentInstance,
      container,
      shouldReuseMarkup,
      context,
    );

    var wrapperID = componentInstance._instance.rootID;
    instancesByReactRootID[wrapperID] = componentInstance;

    return componentInstance;
}
// batchedMountComponentIntoNode
function batchedMountComponentIntoNode(
  componentInstance,
  container,
  shouldReuseMarkup,
  context,
) {
  // 这里的transaction先跳过
  // TODO: React.Transaction
  var transaction = ReactUpdates.ReactReconcileTransaction.getPooled(
    /* useCreateElement */
    !shouldReuseMarkup && ReactDOMFeatureFlags.useCreateElement,
  );
  transaction.perform(
    mountComponentIntoNode, // 见下
    null,
    componentInstance,
    container,
    transaction,
    shouldReuseMarkup,
    context,
  );
  ReactUpdates.ReactReconcileTransaction.release(transaction);
}

// mountComponentIntoNode
function mountComponentIntoNode(
  wrapperInstance,
  container,
  transaction,
  shouldReuseMarkup,
  context,
) {
  var markerName;
  if (ReactFeatureFlags.logTopLevelRenders) {
    var wrappedElement = wrapperInstance._currentElement.props.child;
    var type = wrappedElement.type;
    markerName =
      'React mount: ' +
      (typeof type === 'string' ? type : type.displayName || type.name);
    console.time(markerName);
  }
  // 这个方法在之前就说过 实际上就是通过把Component
  // 实例传入ReactReconciler中来调用mountComponent
  // 这个方法
  // 如果这个组件不是一个无状态组件
  // 那么就会把这个Component推进Mount队列做更新调用
  // 因为无状态组件是没有自己更新状态的功能的所以不存在
  // Mount之后还有更新的操作, 只能从父组件处获取Props
  // 数据进行渲染
  var markup = ReactReconciler.mountComponent(
    wrapperInstance,
    transaction,
    null,
    ReactDOMContainerInfo(wrapperInstance, container),
    context,
    0 /* parentDebugID */,
  );

  if (markerName) {
    console.timeEnd(markerName);
  }

  wrapperInstance._renderedComponent._topLevelWrapper = wrapperInstance;
  // _mountImageIntoNode 基本就是做了两件事情
  // 1. 插入真实的html片段
  // 2. 保存节点片段为下一次Diff做准备
  ReactMount._mountImageIntoNode(
    markup,
    container,
    wrapperInstance,
    shouldReuseMarkup,
    transaction,
  );
}
```

###### `§1.3.4 ReactUpdates`
**Refer to:**
**[ReactUpdates.js](https://github.com/facebook/react/blob/v15.6.2/src/renderers/shared/stack/reconciler/ReactUpdates.js)**

```typescript
// ReactUpdates.batchedUpdates
function batchedUpdates(callback, a, b, c, d, e) {
  // 该方法用于检查
  // ReactUpdates.ReactReconcileTransaction 和 batchingStrategy
  // 的注入情况, 如果这两个方法没有被在启动过程中注入
  // 辣么就会抛错
  ensureInjected();
  // 刚才说过 batchingStrategy在被注入之前都是为null
  return batchingStrategy.batchedUpdates(callback, a, b, c, d, e);
}

// 同样是在ReactDefaultInjection.js
// 注入了batchingStrategy

ReactInjection.Updates.injectBatchingStrategy(ReactDefaultBatchingStrategy);

// ReactDefaultBatchingStrategy.js
var RESET_BATCHED_UPDATES = {
  initialize: emptyFunction,
  close: function() {
    ReactDefaultBatchingStrategy.isBatchingUpdates = false;
  },
};

var FLUSH_BATCHED_UPDATES = {
  initialize: emptyFunction,
  close: ReactUpdates.flushBatchedUpdates.bind(ReactUpdates),
};

var TRANSACTION_WRAPPERS = [FLUSH_BATCHED_UPDATES, RESET_BATCHED_UPDATES];

function ReactDefaultBatchingStrategyTransaction() {
  this.reinitializeTransaction();
}

Object.assign(ReactDefaultBatchingStrategyTransaction.prototype, Transaction, {
  getTransactionWrappers: function() {
    return TRANSACTION_WRAPPERS;
  },
});

// 注入关系: 
// ReactDefaultBatchingStrategyTransaction <---extends--- Transaction
//                                                            ↑
//                                                         override
//                                                            |
//                                                            |
//                                                  getTransactionWrappers
//
// transaction ------instance of------> ReactDefaultBatchingStrategyTransaction

var transaction = new ReactDefaultBatchingStrategyTransaction();

var ReactDefaultBatchingStrategy = {
  isBatchingUpdates: false,

  batchedUpdates: function(callback, a, b, c, d, e) {
    
    var alreadyBatchingUpdates = ReactDefaultBatchingStrategy.isBatchingUpdates;

    ReactDefaultBatchingStrategy.isBatchingUpdates = true;

    if (alreadyBatchingUpdates) {
      return callback(a, b, c, d, e);
    } else {
      // 
      return transaction.perform(callback, null, a, b, c, d, e);
    }
  },
};
```

​	在此处简单的对React的初始化调用栈做一个简单的总结, 中间的生命周期函数调用未写明

#### `§1.4 React启动调用栈(非完整版)`

```markdown
↓: 表示调用

            开始
             ↓
   ReactMount.render
             ↓
ReactMount._renderSubtreeIntoContainer
             ↓
ReactMount._renderNewRootComponent // 触发创建真实DOM节点
             ↓
instantiateReactComponent  // 创建真实DOM
             ↓
batchedMountComponentIntoNode
             ↓
mountComponentIntoNode
             ↓ 
ReactReconciler.mountComponent
             ↓
ReactCompositeComponent.mountComponent
             ↓
ReactCompositeComponent.performInitialMount
             ↓
ReactMount._mountImageIntoNode     
             ↓			\
        setInnerHTML |----  通过根节点挂载
             ↓			/
ReactDOMComponentTree.precacheNode    // 保存virtualDOM 
             ↓
            结束
```

​	至此, 整个React的项目启动完成, 随后会等待用户的交互行为结果进行UI更新.

#### `§1.5 一次完整的模拟启动图`

​	假设有这么一个Component叫做App

​	App代码部分

```jsx
import * as React from 'react';

export default class App extends React.Component {
  render: function() {
    return (
      <div class="container">
        <SubComponent name={"someName"}/>
      </div>
    );
  }
}

class SubComponent extends React.Component {
  constructor(props) {
    super(props);
  }
  render() {
    let {name} = this.props;
    return (
      <div>
        {name}
      </div>
    );
  }
}
```

​	引导启动代码部分:

```jsx
// index.js
import * as React from 'react';
import ReactDOM from 'react-dom';
import App from './Components/App';

ReactDOM.render(<App/>, document.querySelector('#app'));
```

​	JSX编译完成后的引导启动代码, 如果还有不懂关于JSX编译到JS的请回头看[React.createElement](#https://github.com/JeremyWuuuuu/ReactSourceCodeNote/blob/master/Chapter1/Chapter §1.1 - §1.23.md`§1.1 React.createElement`):

```typescript
import * as React from 'react';
import ReactDOM from 'react-dom';
import App from './Components/App';

ReactDOM.render(React.createElement(
  App,
  null
), document.querySelector('#app'));
```
完整的启动过程流程图
![启动流程图](https://github.com/JeremyWuuuuu/ReactSourceCodeNote/blob/master/RenderFlow.png)