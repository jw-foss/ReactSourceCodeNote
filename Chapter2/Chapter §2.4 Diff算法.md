## § 2.4 React的Diff算法

### § 2.4.1 Intro

​    关于**React**, 估计所有开发者一听到或者一说到React想到的都是它的**Diff**, **Diff**这个东西确实是**React**的一个非常大的特点之一, 而且是整套框架的核心内容之一, 加之**virtualDOM**这一特性加持, 使得**React**的这套**Diff** + **virtualDOM**, 得以在前端领域有这样高的地位.

​    **Tree Diff**算法实际上并不是由**React**引入的, 但是为何**React**的**Diff**会如此名声在外? 由于**React**将传统**O(n^3)**的时间复杂度给下降到了**O(n)**的时间复杂度. 试想一下, 如果是按照传统的时间复杂度, <u>**100**</u>个节点可就是**<u>1000000</u>**次的比较, 而**React**的**Diff**算法只需要**<u>100</u>**次, 对于客户端来说, **O(n^3)**的时间复杂度的**Diff**显然是不可接受的(再加之JS的运行速度并不比得上更底层的语言).



### § 2.4.2 React Tree Diff 与传统 Diff 的不同之处

​    策略: 

> * Web UI 中 DOM 节点跨层级的移动操作特别少，可以忽略不计
> * 拥有相同类的两个组件将会生成相似的树形结构，拥有不同类的两个组件将会生成不同的树形结构
> * 对于同一层级的一组子节点，它们可以通过唯一 id 进行区分

​    基于以上三个点, 所以整个**Tree Diff** 可以用很简单的方法来实现

#### 1) 对于上下层级关系来比对: 

* ##### 当做**Diff**的时候, **React**会首先比对前后时间根节点的**Elements** 

![Tree Diff](../RootDiff.png)

```jsx
<!-- Elements Of Different Types -->
<!-- Before -->
<div>
  <Counter/>
</div>

<!-- After --> 

<span>
  <Counter/>
</span>

<!-- Seperator --> 

div.destory();
Counter.destory();
let span = new Span();
let counter = new Counter();
span.append(counter)
```

​    像上述情况, 虽然`Counter`并没有经历任何变动, 但是它的父节点从`div`变成了`span`, 所以`Counter`会先被卸载之后再被挂载进新的父节点中.

​    关于**React**的**DOM Tree**的**Diff**: (PS: 相同颜色的节点进行比较)

![Tree Diff](../TreeDiff.png)

​    **React**的比对策略, 同级与同级比对, 如果比对结果为**false**, 那么由这个节点将被卸载之后重新**mount**进**DOM Tree.** 

​    比如: 

![DiffStrategy](../DiffStrategy.png)

​    按照常规 Diff 的方法

```typescript
// 伪代码
A.removeChild(B);
C.appendChild(B);
```

​    React的Diff策略算法: 

```typescript
// Unmounting phase
A.removeChild(B);
B.destory();
D.destory();
// Re-mounting phase
let newB = new BComponent();
new CComponent().appendChild(newB.appendChild(new DComponent()));
```

​    根据这个过程, 再结合之前生命周期, 可以得出以下调用栈: (如果感兴趣可以去自己尝试在代码里做实验, 给生命周期函数里加上log, 来观察具体调用栈)

```typescript
// interaction trigger update
A.componentWillUpdate();

B.ComponentWillUnmount();
D.ComponentWillUnmount();

new CComponent();
newC.componentWillMount();
new BComponent();
newB.componentWillMount();
new DComponent();
newD.componentWillMount();

C.componentWillUnmount();

newD.componentDidMount();
newB.componentDidMount();
newC.componentDidMount();
A.componentDidUpdate();
// update over
```

我写了一个例子: [Example.js](./Example.js), 通过例子的运行结果可以看到以下log

```javascript
A Will Update
B Will Unmount
D Will Unmount
C created
C Will Mount
B created
B Will Mount
D created
D Will Mount
C Will Unmount
D Did Mount
B Did Mount
C Did Mount
A Did Update
```

​    通过这个log和运行过程可以看到, `C` `B` `D` 三个节点并非是被单纯的移动, 而是先被注销之后, 再重新生成过去, 这一过程实际的开销是比较大的. 所以, 在维护应用时, 要想进一步的提高应用性能.

> 尽可能保有原有的DOM结构, 转而采用CSS的方法来做与之对应的相同的效果(显示或隐藏节点), 会减少一系列不必要的开销, 因为在开始也就说过, 对象的开辟和销毁的开销是很大的. 

​    接下来关注一下, 同级元素的比对.

#### 2) 对于同级关系比对:

#####   1. 组件比对 (Component Diff) :

> React 是基于组件构建应用的，对于组件间的比较所采取的策略也是简洁高效。
>
> - 如果是同一类型的组件，按照原策略继续比较 virtual DOM tree.
> - 如果不是，则将该组件判断为 dirty component，从而替换整个组件下的所有子节点.
> - 对于同一类型的组件，有可能其 Virtual DOM 没有任何变化，如果能够确切的知道这点那可以节省大量的 diff 运算时间，因此 React 允许用户通过 shouldComponentUpdate() 来判断该组件是否需要进行 diff.

![ComponentDiff](../ComponentDiff.png)

​    按照这种情况, C和G的结构实际上是相似的, 根据上述描述, `C, E, F`组件会被整个卸载掉 重新生成`G` `E` `F` 组件, 而并非简单的通过`C -> G`这种替换.

#####   2. 相同类型的DOM元素的比对(DOM Elements Of The Same Type) :

> When comparing two React DOM elements of the same type, React looks at the attributes of both, keeps the same underlying DOM node, and only updates the changed attributes. For example:

```jsx
<div className="before" title="stuff" />

<div className="after" title="stuff" />

// simplely update class from before to after
// replace className 'before' -> 'after'
```

​    在之前生命周期的一部分说到过, 所有的props都会被拉出来放到一个`props`对象当中保存, 当做比对的时候, 在这个例子里的变化`className`会被标记为需要改变的`props` , **React**便会只去更新这个属性

​    当变更style这个属性的时候会有一些不同, 一共有两种情况: 

1. 仅有变更

```jsx
<div style={{color: 'red', fontWeight: 'bold'}} />

<div style={{color: 'green', fontWeight: 'bold'}} />

// simplely update color from red to green
// replace style.color 'red' -> 'green'
```

2. 有属性的删除和添加

```jsx
<div style={{color: 'red'}} />

<div style={{fontWeight: 'bold'}} />
// firstly delete style.color, and add style.fontWeight = 'bold';
// delete style.color
// add style.fontWeight = 'bold'
```



#####  3. 子节点递归 (Recursing of Children):

> By default, when recursing on the children of a DOM node, React just iterates over both lists of children at the same time and generates a mutation whenever there’s a difference.

​    在**React**的源码里`validateExplicitKeys`方法中有这样一段警告, 很多刚开始使用React的同学也肯定遇到过, **React**警告用户, 要为<u>列表节点(List Node)</u>的成员提供一个<u>**Key**</u>属性. 那么这个<u>**Key**</u>属性, 到底扮演一个怎么样的角色呢? 

```typescript
'Each child in an array or iterator should have a unique "key" prop.' +
      '%s%s See https://fb.me/react-warning-keys for more information.%s'
```

​    **Key**在**React**的生态系统中扮演的角色可以如图所示

[example](https://codesandbox.io/s/x22lqwvr9q)

在没有设置**Key**的情况下: 

![WithoutKey](../WithoutKey.png)

​    Log:

```Typescript
// Unmounting 
A will unmount
B will unmount.
C will unmount.

// Re-Mounting
A is created.
A will mount.
C is created.
C will mount.
B is created.
B will mount.

A did mount.
C did mount.
B did mount.
```

在设置有**Key**的情况下:

[example](https://codesandbox.io/s/1v4qxwp2n3)

![WithKey](../WithKey.png)

​    此时的Log情况又是怎么样的呢? 

```typescript
A will update
C will update
B will update

A is updated.
C is updated.
B is updated.
```

​    从这个Log情况可以看到问题, 在没有节点增加或删除的情况下, 如果提供给节点**Key**关键字, 并不会产生多余的销毁, 开辟过程, 能够大幅的提升整体应用性能, 利用原有本身就存在的节点直接更新.  通过在**updating**的钩子函数中加入计时器来粗略观察更新时间, 该结论直接得到印证, 接下来我们可以通过源代码来查看为什么**Key**这个关键字会有这种效果.

