##### `§1.24 节点渲染调`

​	本节主要结合节点实例化和`React.createElement`方法简单介绍上述五种节点的渲染.(内置自定义节点跟用户自定义节点一样)

######  `1. 空节点`

​	在读这一部分代码的时候, 在这个地方一开始我感到很疑惑, 这个`emptyComponentFactory`明显是一个未被声明的变量, 然后我通过VS Code的Search Every Where 找到了对这个`emptyComponentFactory `进行注入的文件(BTW, VS Code的search真的很好用, 在我阅读源码的这个过程中起到了非常关键的作用).

**Refer to:**

**[ReactEmptyComponent.js](https://github.com/facebook/react/tree/v15.6.2/src/renderers/shared/stack/reconciler/ReactEmptyComponent.js)** 

**[ReactDefaultInjection.js](https://github.com/facebook/react/tree/v15.6.2/src/renderers/shared/stack/reconciler/ReactEmptyComponent.js)**

```typescript
// ReactEmptyComponent.js
var emptyComponentFactory;
var ReactEmptyComponentInjection = {
  injectEmptyComponentFactory: function(factory) {
    emptyComponentFactory = factory;
  },
};
var ReactEmptyComponent = {
  create: function(instantiate) {
    return emptyComponentFactory(instantiate);
  },
};
// 此处通过给ReactEmptyComponent挂载一个injection方法
// 在 文件 `ReactDefaultInjection.js`中被调用
ReactEmptyComponent.injection = ReactEmptyComponentInjection; 
module.exports = ReactEmptyComponent;
// ------------- 我是分割线 ------------
  
//ReactDefaultInjection.js
ReactInjection.EmptyComponent.injectEmptyComponentFactory(
  function(instantiate) {
	// 真正负责渲染空节点的工厂 ReactDOMEmptyComponent
    return new ReactDOMEmptyComponent(instantiate);
  });
```

​	接下来仔细分析下`ReactDOMEmptyComponent`到底做了什么微小的贡献

```typescript
// 为了方便看我就用Class的写法转一下
class ReactDOMEmptyComponent {
  constructor(instantiate) {
    this._currentElement = null;
    this._hostNode = null;
    this._hostParent = null;
    this._houstContainerInfo = null;
    this._domID = 0;
  }
  // 作为component的挂载方法
  // mountComponent方法返回mark-ups
  // 关于mountComponent的调用时机, 会在后面介绍
  // TODO: mountComponent调用时机
  mountComponent: function(
    transaction,
    hostParent,
    hostContainerInfo,
    context,
  ) {
    // 修改内置属性
    var domID = hostContainerInfo._idCounter++;
    this._domID = domID;
    this._hostParent = hostParent;
    this._hostContainerInfo = hostContainerInfo;

    var nodeValue = ' react-empty: ' + this._domID + ' ';
    // 事务操作
    // 关于事务操作, 之后会有一部分内容专门用作分析
    // TODO: 事务操作的解析
    if (transaction.useCreateElement) {
      var ownerDocument = hostContainerInfo._ownerDocument;
      var node = ownerDocument.createComment(nodeValue);
      ReactDOMComponentTree.precacheNode(this, node);
      return DOMLazyTree(node);
    } else {
      if (transaction.renderToStaticMarkup) {
        // Normally we'd insert a comment node, but since this is a situation
        // where React won't take over (static pages), we can simply return
        // nothing.
        return '';
      }
      return '<!--' + nodeValue + '-->';
    }
  }
  receiveComponent: function() {}
  // 获取当前节点的挂载节点
  getHostNode: function() {
    return ReactDOMComponentTree.getNodeFromInstance(this);
  }	
  // 销毁节点方法
  unmountComponent: function() {
    ReactDOMComponentTree.uncacheNode(this);
  }
}
```

###### `2. 内置DOM节点`

**Refer to:**

**[ReactHostComponent.js](https://github.com/facebook/react/blob/v15.6.2/src/renderers/shared/stack/reconciler/ReactHostComponent.js)**

**[ReactDOMComponent.js](https://github.com/facebook/react/blob/v15.6.2/src/renderers/dom/shared/ReactDOMComponent.js)**

```typescript
// ReactHostComponent.js
var genericComponentClass; // 注册genericComponentClass到注入阶段进行注入
// 在instantiate里的调用
ReactHostComponent.createInternalComponent(element);
// 构造方法
function createInternalComponent(element) {
  //检查genericComponentClass注入情况
  invariant(
    genericComponentClass,
    'There is no registered component for the tag %s',
    element.type,
  );
  return new genericComponentClass(element);
}
var ReactHostComponent = {
  createInternalComponent,
  injectGenericComponentClass: function(componentClass) {
	// 注入componentClass
    genericComponentClass = componentClass;
  }
}
// 老套路 那么真正被注入的genericComponentClass到底是何方神圣

// ------------------- 我是分割线 ----------------- // 

// ReactDOMComponent.js

// ReactDOMComponent 继承了ReactMultiChild
// 省略具体的方法实现在后面会具体拉出来讲
class ReactDOMComponent {
  // 初始化
  static displayName = 'ReactDOMComponent';
  constructor(element) {
    var tag = element.type;
  	validateDangerousTag(tag);
  	this._currentElement = element;
  	this._tag = tag.toLowerCase();
  	this._namespaceURI = null;
  	this._renderedChildren = null;
  	this._previousStyle = null;
  	this._previousStyleCopy = null;
  	this._hostNode = null;
  	this._hostParent = null;
  	this._rootNodeID = 0;
  	this._domID = 0;
  	this._hostContainerInfo = null;
  	this._wrapperState = null;
  	this._topLevelWrapper = null;
  	this._flags = 0;
  }
  // 挂载方法
  mountComponent: function() {}
  _createOpenTagMarkupAndPutListeners() {}
  _createContentMarkup() {}
  _createInitialChildren() {}
  receiveComponent() {}
  updateComponent() {}
  _updateDOMProperties() {}
  _updateDOMChildren() {}
  getHostNode() {}
  unmountComponent() {}
  getPublicInstance() {}
  // ReactMultiChild给予了React的Component挂载子节点的能力
  // ------ 从ReactMultiChild继承 -------- //
  _reconcilerInstantiateChildren() {}
  _reconcilerUpdateChildren() {} 
  mountChildren() {}
  updateTextContent() {}
  updateMarkup() {}
  updateChildren() {}
  _updateChildren() {}
  unmountChildren() {}
  moveChild() {}
  createChild() {}
  removeChild() {}
  _mountChildAtIndex() {}
  _unmountChild() {}
// ------ 从ReactMultiChild继承 -------- //
}
```

###### `3. 用户自定义节点`

​	对于现在的前端开发者而言, 组件化几乎是所有使用框架的开发者都能想到并且一直在做的一件事情, 那么对于React这个框架而言, 它是怎么来处理和渲染用户自定的节点的.

**Refer to**

**[ReactCompositeComponent.js](https://github.com/facebook/react/blob/v15.6.2/src/renderers/shared/stack/reconciler/ReactCompositeComponent.js)**

```typescript
// 实例化调用
instance = new ReactCompositeComponentWrapper(element);
// 对于这个wrapper的声明基本就是一个空的constructor
var ReactCompositeComponentWrapper = function(element) {
  this.construct(element);
};
// 亦可写作
class ReactCompositeComponentWrapper {
  constructor(element) {
    // bootstrap
    this.construct(element);
  }
}
// 在后面对这个类进行了丰富 那么实际上这个类其实就是继承了
// ReactCompositeComponent以及实例化ReactComponent的方法(用作递归调用)
Object.assign(
  ReactCompositeComponentWrapper.prototype,
  ReactCompositeComponent,
  {
    _instantiateReactComponent: instantiateReactComponent,
  },
);
```

下面来看ReactCompositeComponent的具体实现



```typescript
// ReactCompositeComponent.js
// 里面有一些内容我会省略掉不做具体分析, 在后面的一个调用过程会做具体分析
// 所有的Component的大致调用过程都是相同的, 但只有某些并不会有生命周期
var ReactCompositeComponent = {
  // 此处的construct就是上面部分的引导启动方法
  // 接受一个ReactElement作为参数 
  construct: function(element) {
    this._currentElement = element;
    this._rootNodeID = 0;
    this._compositeType = null;
    this._instance = null;
    this._hostParent = null;
    this._hostContainerInfo = null;

    // 为钩子函数调用做准备 后期会说明调用
    // TODO: 钩子调用过程
    this._updateBatchNumber = null;
    this._pendingElement = null;
    this._pendingStateQueue = null;
    this._pendingReplaceState = false;
    this._pendingForceUpdate = false;

    this._renderedNodeType = null;
    this._renderedComponent = null;
    this._context = null;
    this._mountOrder = 0;
    this._topLevelWrapper = null;

    // 这里是一个存放还在队列中未被调取的cb的对象
    this._pendingCallbacks = null;

    // ComponentWillUnmount的标识符只会被调用一次
    this._calledComponentWillUnmount = false;
  },
  // 某些方法的功能可看注解, 某些可以直接猜测出意思的就略过
  mountComponent() {},// 初始化Component, 渲染html标记, 注册事件监听器
  _constructComponent() {}, // 初始化公共类
  _constructComponentWithoutOwner() {},
  performInitialMountWithErrorHandling() {},
  performInitialMount() {}, //这里是渲染html标记的重要方法
  getHostNode() {}, 
  unmountComponent() {}, // 销毁节点 返还内存
  _maskContext() {}, //把那些在contentType中声明过的给过滤出来
  _processContext() {},
  _processChildContext() {},
  _checkContextTypes() {},
  receiveComponent() {}, //更新钩子调用
  performUpdateIfNecessary() {}, // 如果`_pendingElement`, `_pendingStateQueue`,或 `_pendingForceUpdate`三个有任意一个及以上则update
  updateComponent() {},
  _processPendingState() {},
  _performComponentUpdate() {},
  _updateRenderedComponent() {}, //做更新时重新调用render来更新html
  _replaceNodeWithMarkup() {},
  _renderValidatedComponentWithoutOwnerOrContext() {}, // 调用类实例的render方法
  _renderValidatedComponent() {}, //调用上面一个方法
  attachRef() {}, // 挂载Ref(注意无状态组件是不能有Ref字段的, 因为它没有一个实例对象可供访问)
  detachRef() {}, // 剥离Ref
  getName() {}, // 返回一个可供识别的名字
  getPublicInstance() {}, // 返回公共类实例(如果是无状态组件将会返回null)
  _instantiateReactComponent: null,
}
```
###### `4. 文本节点`

​	当需要去构造一个文本节点时, 调用的方法:

```typescript
// instantiateReactComponent.js
// PS: 此处的node可以是string 或 number类型 都会被视作一个文本常量
instance = ReactHostComponent.createInstanceForText(node);
```

**Refer to:**

- **[ReactHostComponent.js](https://github.com/facebook/react/blob/v15.6.2/src/renderers/shared/stack/reconciler/ReactHostComponent.js)**
- **[ReactDOMTextComponent.js](https://github.com/facebook/react/blob/v15.6.2/src/renderers/dom/shared/ReactDOMTextComponent.js)**

```typescript
// ReactHostComponent.js
// 与内置的DOM节点一样, 文本节点同样是
// 通过ReactInjection来注入构造工厂
 ReactInjection.HostComponent.injectTextComponentClass(ReactDOMTextComponent);

// ------------------------ 我是分割线 --------------------- //
// ReactDOMTextCompoent.js

var ReactDOMTextComponent = function(text) {
  // TODO: This is really a ReactText (ReactNode), not a ReactElement
  this._currentElement = text;
  this._stringText = '' + text;
  // ReactDOMComponentTree uses these:
  this._hostNode = null;
  this._hostParent = null;

  // Properties
  this._domID = 0;
  this._mountIndex = 0;
  this._closingComment = null;
  this._commentNodes = null;
};
// 接着丰富ReactDOMTextComponent的类方法
Object.assign(ReactDOMTextComponent, {
  mountComponent() {}, // 渲染挂载html
  receiveComponent() {}, // 更新text
  getHostNode() {}, // 获取挂载节点
  unmountComponent() {} // 销毁节点
});
```
###### `总结:`

​	从以上四种React支持的Component类中不难看出, 所有的类几乎都有以下几个方法:

```typescript
class ReactBaseComponent {
  mountComponent() {}, //负责节点的挂载与渲染
  receiveComponent() {}, // 负责节点更新
  getHostNode() {}, // 负责获取挂载点
  unmountComponent() {} // 负责销毁节点
}

//所有的Component都能从ReactBaseComponent继承通过自身特点来强化
```

​	而实际上"真正"拥有生命周期的节点类型是`内置DOM节点`和`用户自定义节点`. 对于这些钩子方法的调用, 会在后面介绍到

![ReactComponentType](https://github.com/JeremyWuuuuu/ReactSourceCodeNote/blob/master/ReactComponentType.png)
