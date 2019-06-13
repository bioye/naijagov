package com.naijagov.naijagov.model;

public class Form {

    public Iterable<PollingUnit> getPollingUnits() {
        return pollingUnits;
    }

    public void setPollingUnits(Iterable<PollingUnit> pollingUnits) {
        this.pollingUnits = pollingUnits;
    }
    private Iterable<PollingUnit> pollingUnits;
}