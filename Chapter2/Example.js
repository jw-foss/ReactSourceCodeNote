import React, {Component} from 'react';

class Logger extends Component {

    log(action) {
        console.log(this.constructor.name + ' ' + action);
    }
    constructor(props) {
        super(props);
        this.log('created');
    }

    componentWillMount() {
        this.log('Will Mount');
    }

    componentDidMount() {
        this.log('Did Mount');
    }

    componentWillUpdate() {
        this.log('Will Update');
    }

    componentDidUpdate() {
        this.log('Did Update');
    }

    componentWillUnmount() {
        this.log('Will Unmount');
    }

    render() {
        throw new Error('You should give it something to render');
        return (
            <div/>
            );
    }
}

class A extends Logger {

    state = {
        isReplaced: false,
    }

    constructor() {
        super();
    }

    render() {

        if (!this.state.isReplaced) {

        return (<div>
            <B/>
            <C/>
        </div>)
    } else {
        return (
        <div>
            <C>
            <B/>
            </C>
        </div>
        )
    }
}
    
    componentDidMount() {
        super.componentDidMount();
        console.log('=====================');
        setTimeout(() => {
            this.setState({
                isReplaced: true
            })
        }, 1000);
    }

}

class B extends Logger {
    constructor() {
        super();
    }
    render() {
       return (<div>
            <D/>
        </div>)
    }
}

class C extends Logger {
    constructor() {
        super();
    }
    render() {
        return (
            <div>
            C
            {this.props.children? this.props.children : null}
            </div>
        )
    }
}

class D extends Logger {
    constructor() {
        super();
    }

    render() {
        return (
            <div>D</div>
        )
    }
}

export default A;
