package com.naijagov.naijagov.model;

import java.io.Serializable;

import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.ManyToOne;

@Entity
public class Ward implements Serializable {
    @ManyToOne
    private LocalGov localGov;
    private String name;
    private String fullCode;
    private int code;
    @Id
    private int id;
    private static final long serialVersionUID = -6033332532455086865L;

    public String getFullCode() {
        return fullCode;
    }

    public int getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public int getCode() {
        return code;
    }

  public LocalGov getLocalGov() {
    return localGov;
  }
}
