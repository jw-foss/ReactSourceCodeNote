## `§1. React 启动过程`

​	众所周知, React的项目的启动就是由这一行代码引导启动的: 

```jsx
import * as React from 'react';
import * as ReactDom from 'react-dom';

class SomeComponent extends React.PureComponent {
  render() {
    return
     (<div>Component</div>)
  }
}

ReactDom.render(<SomeComponent/>, document.querySelector('#app'));
```

​	那么这个render到底是个什么神奇的函数呢, 在这个render函数内部又发生了哪些过程, 让我们一步一步往下走.

​	在继续深入之前需要来介绍一下React里面的两个重要的方法, 就是`createElement`方法和`createClass`这两个构建React的Component, 以及生成React的Element(以下叫节点)的最重要的方法.

​	当React需要去实例化一个Component, 并且得到一个React的节点(React在做DOM挂载时使用的便是这个东西)的时候, 便会通过`React.createElement`这个方法来构建ReactComponent, 源代码如下: 

#### `§1.1 React.createElement`

```typescript
React.createElement(
  type, 
  // @type 
  // 当前节点的类型:
  // 1. 内置类型: 如 'div' 'p' 'span'等
  // 2. 自定义类型: 如 'CustomComponent'
  config,
  // @config: 
  // 当前节点所带的属性
  children
  // @children: 
  // 顾名思义, 当前节点的子节点
) {
  var propName;
  
  var props = {};

  var key = null;
  var ref = null;
  var self = null;
  var source = null;
	
  // 传递属性
  if (config != null) {
    // 判断当前节点是否具有有效的 Ref
    // 这里的ref属性在React的节点上起到了非常重要的作用
  	// 是节点保留字, 在后面分析生命周期时会做具体讲解
    if (hasValidRef(config)) {
      ref = config.ref;
    }
    // 判断当前节点是否具有有效的特殊 Key
    // key属性也是节点的保留属性, 为React的diff做了非常大的贡献
    if (hasValidKey(config)) {
      key = '' + config.key;
    }

    self = config.__self === undefined ? null : config.__self;
    source = config.__source === undefined ? null : config.__source;
    // 把剩下的属性都传给props
    for (propName in config) {
      if (
        hasOwnProperty.call(config, propName) &&
        !RESERVED_PROPS.hasOwnProperty(propName)
      ) {
        props[propName] = config[propName];
      }
    }
  }
  
  // 当前节点子节点添加, 子节点可以是一个也可以是多个
  // 这些子节点将被添加到刚刚声明的props上.
  var childrenLength = arguments.length - 2;
  if (childrenLength === 1) {
    props.children = children;
  } else if (childrenLength > 1) {
    var childArray = Array(childrenLength);
    for (var i = 0; i < childrenLength; i++) {
      childArray[i] = arguments[i + 2];
    }
    if (__DEV__) {
      if (Object.freeze) {
        Object.freeze(childArray);
      }
    }
    props.children = childArray;
  }

  // 处理根节点上的默认的属性
  if (type && type.defaultProps) {
    var defaultProps = type.defaultProps;
    for (propName in defaultProps) {
      if (props[propName] === undefined) {
        props[propName] = defaultProps[propName];
      }
    }
  }
  
  //省略掉一部分开发环境的检错代码
  
  // 返回一个ReactElement节点
  return ReactElement(
    type,
    key,
    ref,
    self,
    source,
    ReactCurrentOwner.current, 
    props,
  );
}

// 这个方法其实特别简单, 只是在为ReactElement挂载属性

/**
 * 用来构造ReactElement.
 * @params type 节点的类型
 * @params key 节点的特有键
 * @params ref 节点的引用
 * @params self 节点自身
 * @params source 节点的源
 * @parmas owner 节点的从属者
 * @params props 节点的属性
 * @returns ReactElement
 */
var ReactElement = function(type, key, ref, self, source, owner, props) {
  var element = {
    // 标记React Element
    $$typeof: REACT_ELEMENT_TYPE,
    // React Element的内置属性
    type: type,
    key: key,
    ref: ref,
    props: props,
    // 记录下构建该React Element的Component
    _owner: owner,
  };
  // 此处省略掉一部分无关代码, 是在开发环境做出限制, 当生产环境时会被抛弃
  return element;
};
```

​	在这里了解了React如何通过Component构建节点之后, 还需要了解的是React如何来实现它的最核心概念之一.

**`Component`**, 在老版本的ES5里, 我们来构建一个React的Component都是通过方法**`React.createClass`**来实现的, 

而在现在的ES6+或者说是Typescript中来写一个React的Component是通过以下方式, 虽然写的方法改变了, 但是实际上也只是**`React.createClass`**语法糖(syntax sugar).

```typescript
class CustomComponent extends React.PureComponent {
  // implementation 
}
```

##### **`§1.11 穿插一个简单的createElement的应用`**

**JSX:**

```jsx
render( 
	<div className="parent" custuomProp={"someProp"}>
  		<span className="child">
  		</span>
	</div>
)
```

**转义代码:**

```typescript
React.createElement(
  // 父节点
  'div', //type
  {
    className: 'parent',
    cusutomProp: 'someProp',
  }, // props
  
  // 子节点
  React.createElement(
  	'span', // type
    {
      className="child"
    }, // props
    null, // 没有子节点
  )
);

// 通过调用得到的ReactElement节点对象
var reactElementObject = {
  type: 'div',
  key: null, 
  ref: null,
  props: {
  	className: 'parent',
    customProp: 'someProp',
    children: [
  	  {
  		type: 'span',
        key: null,
  		ref: null,
  		props: { className: 'child'
		},
  		__owner: ReactCurrentOwner.current
	  }
  	]
  },
  __owner: ReactCurrentOwner.current
}

// 脚注: 这样得到的ReactElement节点对象, 显然是要比真正的DOM节点要精简很多的, 这也是React性能卓越的一部分原因.
```

#### `§1.2 React.createClass`

```typescript
 /**
   * 创建一个React的复合组件
   * @param {object} spec Class的定义(该定义中必须带有render属性)C
   * @return {function} 返回一个Component的构造器
   */
  function createClass(spec) {
    // 该处的identify方法仅仅是为了返回一个不带有name属性的匿名函数
    // 实际此处代码可以理解为
    // var Constructor = function(props, context, updater) {}
    // 这样会稍微好理解一点
    
    // 也可以写作
    //  ---------------- 我是分割线 -------------------
    
    class Constructor {
     	constructor(props, context, updater) {
     		 // ...
     		}
     }
    
    //  ---------------- 我是分割线 -------------------
    
    var Constructor = identity(function(props, context, updater) {
      // 该构造函数会被覆盖

      // ... 此处省略掉开发环境的警告

      // 自动绑定方法
      if (this.__reactAutoBindPairs.length) {
        bindAutoBindMethods(this);
      }
	  
      // 初始化props
      this.props = props;
      // 初始化context
      this.context = context;
      // 初始化refs 给到一个空对象
      this.refs = emptyObject;
      // 初始化更新函数
      this.updater = updater || ReactNoopUpdateQueue;
	 
      // 初始化state
      this.state = null;

	  
      var initialState = this.getInitialState ? this.getInitialState() : null;
      // ... 此处省略掉开发环境的警告
      
      //  当getInitialState存在时, 若返回的值不是一个非数组对象时抛错
      _invariant(
        typeof initialState === 'object' && !Array.isArray(initialState),
        '%s.getInitialState(): must return an object or null',
        Constructor.displayName || 'ReactCompositeComponent'
      );
      
	  // 由于ReactClasses没有构造函数, 所以他们会用getInitialState
      // 和ComponentWillMount来进行初始化
      this.state = initialState;
    });
    
    // 成员函数继承
    // 下面会分析ReactClassComponent类里包含有一些什么具体的东西
    Constructor.prototype = new ReactClassComponent();
    // 构造函数指向回自己
    Constructor.prototype.constructor = Constructor;
    // 初始化 __reactAutoBindPairs
    Constructor.prototype.__reactAutoBindPairs = [];
	
    // 此处通过混合函数对Constructor做了四次混合
    // 混合函数的基本作用其实就是为了为ReactClass挂载属性和钩子
    // 关于mixSpecIntoComponent源码分析在下面:
    // 此处有点小疑惑, 因为从源码上看这里的injectedMixins是一个空的List
    // 等于此处代码并没有做任何事情
    injectedMixins.forEach(mixSpecIntoComponent.bind(null, Constructor));
	// 混入ComponentDidMount钩子 (见105行)
    mixSpecIntoComponent(Constructor, IsMountedPreMixin);
    // 混入Class的自定义属性(通过用户自己定义)
    mixSpecIntoComponent(Constructor, spec);
    // 混入ComponentWillUnmount钩子(见111行)
    mixSpecIntoComponent(Constructor, IsMountedPostMixin);

    // 在所有混合都结束之后, 初始化默认属性
    if (Constructor.getDefaultProps) {
      Constructor.defaultProps = Constructor.getDefaultProps();
    }
    // ... 此处省略掉开发环境的警告
    
    // 检测自定义的组件是否有render方法
    _invariant(
      Constructor.prototype.render,
      'createClass(...): Class specification must implement a `render` method.'
    );

    // ... 此处省略掉开发环境的警告

    // 通过设置成员为空值, 减少成员的检查的时间
    for (var methodName in ReactClassInterface) {
      if (!Constructor.prototype[methodName]) {
        Constructor.prototype[methodName] = null;
      }
    }

    return Constructor;
  }

	// 被混入的方法
	// 挂载componentDidMount钩子
 	var IsMountedPreMixin = {
    	componentDidMount: function() {
      	  this.__isMounted = true;
    	}
  	};
	// 挂载componentWillUnmount钩子
  	var IsMountedPostMixin = {
    	componentWillUnmount: function() {
     	  this.__isMounted = false;
    	}
  	};
```

##### ```§1.21 ReactClassComponent```

```typescript
// 源码当中的类的声明都是通过function 在这里为了方便阅读, 通过class方式列举

// 空类
class ReactClassComponent {
  constructor() {}
}

// 方法继承

Object.assign(ReactClassComponent.prototype, ReactComponent.prototype, 		ReactClassMixin);

// 此处省略掉具体实现
var ReactClassMixin = {
  relaceState: function() {},
  isMounted: function() {}
}

// 此处仅列举类方法和类属性, 忽略掉具体实现, 感兴趣可以打开源码 `ReactBaseClasses.js` 阅读具体实现, 

class ReactComponent {
  constructor(props, context, updater) {
    this.props = props;
    this.context = context;
    this.refs = emptyObject;
    this.updater = updater || ReactNoopUpdateQueue;
  }
  
  isReactComponent: {}
  // 这两个方法会在之后单独拿出来分析
  setState(partialState, callback) {}
  forceUpdate(callback) {}
}
```

##### ```§1.22 MixinSpecIntoComponent```

```typescript
  /**
   * 混合工具函数, 以用于处理在React Class中的规则以及保留字校验
   */
  function mixSpecIntoComponent(Constructor, spec) {
    
    if (!spec) {
	  // ... 此处省略掉开发环境的警告
      return;
    }
	// 校验class类别
    _invariant(
      typeof spec !== 'function',
      "ReactClass: You're attempting to " +
        'use a component class or function as a mixin. Instead, just use a ' +
        'regular object.'
    );
    // 校验class有效性
    _invariant(
      !isValidElement(spec),
      "ReactClass: You're attempting to " +
        'use a component as a mixin. Instead, just use a regular object.'
    );
	// 抓取构造类方法
    var proto = Constructor.prototype;
    var autoBindPairs = proto.__reactAutoBindPairs;

     // 当该Class含有mixin属性时
     // 在任何其他属性之前处理mixin，我们需要保证相同
     // 链接顺序应用在具有DEFINE_MANY策略的方法上
     // mixins在spec中的这些方法之前或之后列出。
    if (spec.hasOwnProperty(MIXINS_KEY)) {
      RESERVED_SPEC_KEYS.mixins(Constructor, spec.mixins);
    }
    
    for (var name in spec) {
      
      if (!spec.hasOwnProperty(name)) {
        continue;
      }

	  // 在此处跳过mixin的处理, 因为之前已经处理过
      if (name === MIXINS_KEY) {
        continue;
      }
      
      var property = spec[name];
      var isAlreadyDefined = proto.hasOwnProperty(name);
      validateMethodOverride(isAlreadyDefined, name);
      
	  // 处理保留关键字
      // 保留关键字包含有
      // displayName, mixins, childContextTypes, contentTypes
      // getDefaultProps, propTypes, statics, autobind
      if (RESERVED_SPEC_KEYS.hasOwnProperty(name)) {
        RESERVED_SPEC_KEYS[name](Constructor, property);
      } else {
        // 添加构造类方法
        // 以下两种方法是不应该被自动绑定的: 
        // 1. Interface中包含的方法
        // 2. 被混入覆盖的方法
        
        var isReactClassMethod = ReactClassInterface.hasOwnProperty(name);
        var isFunction = typeof property === 'function';
        // 判断是否需要自动绑定
        var shouldAutoBind =
          isFunction &&
          !isReactClassMethod &&
          !isAlreadyDefined &&
          spec.autobind !== false;
        
        if (shouldAutoBind) {
          autoBindPairs.push(name, property);
          proto[name] = property;
        } else {
          if (isAlreadyDefined) {
            var specPolicy = ReactClassInterface[name];

            // 这些case会在之前的validateMethodOverride检测掉
            _invariant(
              isReactClassMethod &&
                (specPolicy === 'DEFINE_MANY_MERGED' ||
                  specPolicy === 'DEFINE_MANY'),
              'ReactClass: Unexpected spec policy %s for key %s ' +
                'when mixing in component specs.',
              specPolicy,
              name
            );

            // 对于定义过多次的方法, 会在调用该方法之前调用之前已经存在的方法
            // 如果满足条件, 那么这写方法将会被合并
            if (specPolicy === 'DEFINE_MANY_MERGED') {
              proto[name] = createMergedResultFunction(proto[name], property);
            } else if (specPolicy === 'DEFINE_MANY') {
              proto[name] = createChainedFunction(proto[name], property);
            }
          } else {
           // ... 此处省略掉开发环境的警告
          }
        }
      }
    }
  }
```

##### `§1.23 自定义组件的实例化:`

​	在已经知道了如何创建自定义组件, 以及React如何创建属于React的自带的ReactElement, 接下来就到了把对应的ReactElement给实例化进行组件渲染的时候, 可以注意到的是每一个ReactElement都会有对应的一个type字段, 而React正是通过这个字段来进行实例化组件的.

##### Refer to [instantiateReactComponent.js](https://github.com/facebook/react/blob/v15.6.2/src/renderers/shared/stack/reconciler/instantiateReactComponent.js)

```typescript
/**
 * 通过传入的React节点对象, 创建并返回一个真实挂载的DOM节点对象
 *
 * @param {ReactNode} node - React节点对象, 见 `§1.11`
 * @param {boolean} shouldHaveDebugID - 开发环境属性 可忽略
 * @return {object} A new instance of the element's constructor.
 * @protected
 */
function instantiateReactComponent(node, shouldHaveDebugID) {
  var instance;

  if (node === null || node === false) {
    instance = ReactEmptyComponent.create(instantiateReactComponent);
  } else if (typeof node === 'object') {
    var element = node;
    var type = element.type;
    
    // 此处检查node type 如果不是自定义组件或者不是内建组件, 将会抛错
    if (typeof type !== 'function' && typeof type !== 'string') {
      var info = '';
      
      // ... 省略掉一部分开发警告
      
      info += getDeclarationErrorAddendum(element._owner);
      invariant(
        false,
        'Element type is invalid: expected a string (for built-in components) ' +
          'or a class/function (for composite components) but got: %s.%s',
        type == null ? type : typeof type,
        info,
      );
    }

    // 处理内建组件 
    // 诸如 'div', 'span', 'p'
    if (typeof element.type === 'string') {
      instance = ReactHostComponent.createInternalComponent(element);
      // 处理内置自定义组件
    } else if (isInternalComponentType(element.type)) {
	  
      // 构造实例
      instance = new element.type(element);
	  
      if (!instance.getHostNode) {
        instance.getHostNode = instance.getNativeNode;
      }
    } else {
      // 如果并不是内置组件
      // 构造实例
      instance = new ReactCompositeComponentWrapper(element);
    }
    // 构造文本节点
  } else if (typeof node === 'string' || typeof node === 'number') {
    instance = ReactHostComponent.createInstanceForText(node);
  } else {
    // 当节点不属于任何一种节点, 便会抛错.
    invariant(false, 'Encountered invalid React node of type %s', typeof node);
  }

      // ... 省略掉一部分开发警告

  // 这两个字段是在应用运行过程中用来做Diff的关键字段, 之后会详细说到
  instance._mountIndex = 0;
  instance._mountImage = null;

      // ... 省略掉一部分开发警告

  return instance;
}
```

​	透过上述代码总结一下, 在React的整个项目结构当中, 一共具有四中节点: 

- 内置的DOM节点.
- 空节点
- 内置的自定义节点.(这些节点其实可以在React源代码的很多地方找到 e.g ReactART)
- 用户定义的自定义节点
- 文本节点
