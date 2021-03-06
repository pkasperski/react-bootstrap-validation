import React from 'react';
import InputContainer from './InputContainer';
import ValidatedInput from './ValidatedInput';
import RadioGroup from './RadioGroup';

import Validator from './Validator';
import FileValidator from './FileValidator';

function getInputErrorMessage(input, ruleName) {
    let errorHelp = input.props.errorHelp;

    if (typeof errorHelp === 'object') {
        return errorHelp[ruleName];
    } else {
        return errorHelp;
    }
}

export default class Form extends InputContainer {
    constructor(props) {
        super(props);

        this.state = {
            isValid: true,
            invalidInputs: {}
        };
    }

    componentWillMount() {
        super.componentWillMount();

        this._validators = {};
    }

    registerInput(input) {
        super.registerInput(input);

        if (typeof input.props.validate === 'string') {
            this._validators[input.props.name] = this._compileValidationRules(input, input.props.validate);
        }
    }

    unregisterInput(input) {
        super.unregisterInput(input);

        delete this._validators[input.props.name];
    }

    render() {
        return (
            <form ref="form"
                  onSubmit={this._handleSubmit.bind(this)}
                  action="#"
                  className={this.props.className}>
                {this._renderChildren(this.props.children)}
            </form>
        );
    }

    getValues() {
        return Object.keys(this._inputs).reduce((values, name) => {
            values[name] = this._getValue(name);

            return values;
        }, {});
    }

    _renderChildren(children) {
        if (typeof children !== 'object' || children === null) {
            return children;
        }

        return React.Children.map(children, child => {
            if (typeof child !== 'object' || child === null) {
                return child;
            }

            if (child.type === ValidatedInput || child.type === RadioGroup) {
                let name = child.props && child.props.name;

                if (!name) {
                    throw new Error('Can not add input without "name" attribute');
                }

                let newProps = {
                    _registerInput  : this.registerInput.bind(this),
                    _unregisterInput: this.unregisterInput.bind(this)
                };

                let fireEvent = (!child.props.validateOnEvent) ? this.props.validateOnEvent : child.props.validateOnEvent;

                let origOnChange = child.props[fireEvent]

                newProps[fireEvent] = e => {
                    this._onInputChange(name, e);

                    return origOnChange && origOnChange(e);
                };

                let defaultValue = this.props.model && this.props.model[name];

                if (child.props.type === 'checkbox') {
                    newProps.defaultChecked = defaultValue;
                } else {
                    newProps.defaultValue = defaultValue;
                }

                let error = this._hasError(name);

                if (error) {
                    newProps.bsStyle = 'error';

                    if (typeof error === 'string') {
                        newProps.help = error;
                    } else if (child.props.errorHelp) {
                        newProps.help = child.props.errorHelp;
                    }
                }

                return React.cloneElement(child, newProps);
            } else {
                return React.cloneElement(child, {}, this._renderChildren(child.props && child.props.children));
            }
        });
    }

    _onInputChange(name) {
        this._validateOne(name, this.getValues());
    }

    _hasError(iptName) {
        return this.state.invalidInputs[iptName];
    }

    _setError(iptName, isError, errText) {
        if (isError && errText
            && typeof errText !== 'string'
            && typeof errText !== 'boolean')
        {
            errText = errText + '';
        }

        // set value to either bool or error description string
        this.setState({
            invalidInputs: Object.assign(
                this.state.invalidInputs,
                {
                    [iptName]: isError ? errText || true : false
                }
            )
        });
    }

    _validateOne(iptName, context) {
        let input = this._inputs[iptName];

        if (Array.isArray(input)) {
            console.warn('Multiple inputs use the same name "' + iptName + '"');

            return false;
        }

        let value = context[iptName];
        let isValid = true;
        let validate = input.props.validate;
        let result, error;

        if (typeof this.props.validateOne === 'function') {
            result = this.props.validateOne(iptName, value, context);
        } else if (typeof validate === 'function') {
            result = validate(value, context);
        } else if (typeof validate === 'string') {
            result = this._validators[iptName](value);
        } else {
            result = true;
        }

        // if result is !== true, it is considered an error
        // it can be either bool or string error
        if (result !== true) {
            isValid = false;

            if (typeof result === 'string') {
                error = result;
            }
        }

        this._setError(iptName, !isValid, error);

        return isValid;
    }

    _validateAll(context) {
        let isValid = true;
        let errors = [];

        if (typeof this.props.validateAll === 'function') {
            let result = this.props.validateAll(context);

            if (result !== true) {
                isValid = false;

                Object.keys(result).forEach(iptName => {
                    errors.push(iptName);

                    this._setError(iptName, true, result[iptName]);
                });
            }
        } else {
            Object.keys(this._inputs).forEach(iptName => {
                if (!this._validateOne(iptName, context)) {
                    isValid = false;
                    errors.push(iptName);
                }
            });
        }

        return {
            isValid: isValid,
            errors: errors
        };
    }

    _compileValidationRules(input, ruleProp) {
        let rules = ruleProp.split(',').map(rule => {
            let params = rule.split(':');
            let name = params.shift();
            let inverse = name[0] === '!';

            if (inverse) {
                name = name.substr(1);
            }

            return { name, inverse, params };
        });

        let validator = (input.props && input.props.type) === 'file' ? FileValidator : Validator;

        return val => {
            let result = true;

            rules.forEach(rule => {
                if (typeof validator[rule.name] !== 'function') {
                    throw new Error('Invalid input validation rule "' + rule.name + '"');
                }

                let ruleResult = validator[rule.name](val, ...rule.params);

                if (rule.inverse) {
                    ruleResult = !ruleResult;
                }

                if (result === true && ruleResult !== true) {
                    result = getInputErrorMessage(input, rule.name) ||
                        getInputErrorMessage(this, rule.name) || false;
                }
            });

            return result;
        };
    }

    _getValue(iptName) {
        let input = this._inputs[iptName];

        if (Array.isArray(input)) {
            console.warn('Multiple inputs use the same name "' + iptName + '"');

            return false;
        }

        let value;

        if (input.props.type === 'checkbox') {
            value = input.getChecked();
        } else if (input.props.type === 'file') {
            value = input.getInputDOMNode().files;
        } else {
            value = input.getValue();
        }

        return value;
    }

    _handleSubmit(e) {
        e.preventDefault();

        let values = this.getValues();

        let { isValid, errors } = this._validateAll(values);

        if (isValid) {
            this.props.onValidSubmit(values);
        } else {
            this.props.onInvalidSubmit(errors, values);
        }
    }
}

Form.propTypes = {
    className      : React.PropTypes.string,
    model          : React.PropTypes.object,
    onValidSubmit  : React.PropTypes.func.isRequired,
    onInvalidSubmit: React.PropTypes.func,
    validateOne    : React.PropTypes.func,
    validateAll    : React.PropTypes.func,
    validateOnEvent: React.PropTypes.string,
    errorHelp      : React.PropTypes.oneOfType([
        React.PropTypes.string,
        React.PropTypes.object
    ])
};

Form.defaultProps = {
    model          : {},
    className      : 'form-horizontal',
    validateOnEvent: 'onChange',
    onInvalidSubmit: () => {}
};
